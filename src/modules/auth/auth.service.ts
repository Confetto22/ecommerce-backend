import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { SignupDto } from './dto/signup.dto';
import { User } from '../user/entities/user.entity';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { compare, hash } from 'bcryptjs';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';
import type { StringValue } from 'ms';
import * as crypto from 'crypto';
import { TokenType } from 'generated/prisma/enums';
import { addHours } from 'date-fns';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly db: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(
    registerData: SignupDto,
  ): Promise<{ user: User; message: string }> {
    // check if user exists
    const foundUser = await this.db.user.findUnique({
      where: { email: registerData?.email },
    });
    if (foundUser) {
      throw new ConflictException('User already exists');
    }

    // hash password and save
    const hashedPassword = await hash(registerData?.password, 12);

    const user = await this.db.user.create({
      data: {
        username: registerData.username,
        gender: registerData.gender,
        email: registerData.email,
        role: registerData.role,
        city: registerData.city,
        country: registerData.country,
        password: hashedPassword,
      },
    });

    return {
      user: new User(user),
      message:
        'Registration successful! Please check your email to verify your account before logging in.',
    };
  }

  async login(user: User, res: Response) {
    const isProduction =
      this.configService.getOrThrow<string>('NODE_ENV') === 'production';
    const accessMaxAge = 15 * 60 * 1000; // 15 minutes
    const refreshMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    const tokenPayload: JwtPayload = {
      sub: user?.id,
      role: user?.role,
    };

    const accessToken = this.jwtService.sign(tokenPayload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<StringValue>(
        'JWT_ACCESS_EXPIRATION',
      ),
    });

    const refreshToken = this.jwtService.sign(tokenPayload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<StringValue>(
        'JWT_REFRESH_EXPIRATION',
      ),
    });

    const hashedRefreshToken = await hash(refreshToken, 12);
    await this.userService.updateUser(user.id, {
      refreshToken: hashedRefreshToken,
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: accessMaxAge,
      path: '/',
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: refreshMaxAge,
      path: '/',
    });
  }

  async logoutAll(userId: string, res: Response): Promise<{ message: string }> {
    await this.invalidateAllSessions(userId);

    // Clear token cookies
    this.clearTokenCookies(res, this.configService);

    return {
      message: 'Logged out successfully',
    };
  }

  async verifyUser(email: string, password: string) {
    try {
      const user = await this.userService.getUserByEmail(email);
      if (!user.password) {
        throw new UnauthorizedException();
      }
      const passwordMatch = await compare(password, user.password);
      if (!passwordMatch) {
        throw new UnauthorizedException();
      }
      return user;
    } catch (err) {
      throw new UnauthorizedException('credentials are not valid.');
    }
  }

  async verifyRefreshToken(refreshToken: string, userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user?.refreshToken) {
      throw new UnauthorizedException();
    }
    const ok = await compare(refreshToken, user.refreshToken);
    if (!ok) {
      throw new UnauthorizedException();
    }
    return new User(user);
  }

  async forgotPassword(email): Promise<{ message: string }> {
    // fetch user by their email to confirm their existence
    const user = await this.db.user.findUnique({
      where: {
        email,
      },
    });

    // Don't reveal if user exists or not (security best practice)
    // Even if user does not exist, return success message to prevent email enumeration
    if (!user) {
      return {
        message:
          'If an account with that email exists, a password reset link has been sent.',
      };
    }
    // Check if user has a password (OAuth users might not have one)

    // Even if user does not have a password return success message to prevent account enumeration
    if (!user.password) {
      return {
        message:
          'If an account with that email exists, a password reset link has been sent.',
      };
    }
    // Generate password reset token
    const resetToken = await this.generatePasswordResetToken(user.id);
    // Send password reset email via email service
    // If there's an error, Don't throw it to prevent email enumeration
    try {
    } catch (error) {}
    // Always return success message to prevent email enumeration
    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // validate token
    const userId = await this.validatePasswordResetToken(token);
    // Hash new password
    const hashedPassword = await hash(newPassword, 12);
    // Update user password
    const updateduser = await this.db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    // Delete the token after use
    await this.deleteToken(token);
    // Invalidate all existing sessions for security
    await this.invalidateAllSessions(userId);

    return {
      message: 'Password has been reset successfully',
    };
  }

  /**
   * Generate password reset token
   */
  async generatePasswordResetToken(userId: string): Promise<string> {
    // Generate a random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    // Store token in database with expiration (1 hour)
    const expiresAt = addHours(new Date(), 1);

    await this.db.token.create({
      data: {
        token: hashedToken,
        type: TokenType.PASSWORD_RESET,
        userId,
        expires: expiresAt,
      },
    });

    return hashedToken;
  }

  /**
   * Validate password reset token
   */
  async validatePasswordResetToken(token: string): Promise<string> {
    const tokenRecord = await this.db.token.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid reset token');
    }

    if (tokenRecord.type !== TokenType.PASSWORD_RESET) {
      throw new UnauthorizedException('Invalid token type');
    }

    if (tokenRecord.expires < new Date()) {
      throw new UnauthorizedException('Token has expired');
    }

    return tokenRecord.userId;
  }

  /**
   * Delete a token after use
   */
  async deleteToken(token: string): Promise<void> {
    await this.db.token
      .delete({
        where: { token },
      })
      .catch(() => {
        // Token might already be deleted, ignore error
      });
  }

  /**
   * Invalidate all sessions for a user (without clearing cookies)
   * Used internally for password reset
   */
  async invalidateAllSessions(userId: string): Promise<void> {
    await this.db.session.deleteMany({
      where: { userId },
    });
  }

  /**
   * Clear both token cookies
   */
  private clearTokenCookies(res: Response, configService: ConfigService) {
    const isProduction =
      configService.getOrThrow<string>('NODE_ENV') === 'production';

    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });
  }
}
