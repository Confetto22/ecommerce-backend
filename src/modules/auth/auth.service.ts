import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { User } from '../user/entities/user.entity';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { compare, hash } from 'bcryptjs';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly db: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(
    registerData: CreateUserDto,
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
    const {
      firstname,
      lastname,
      email,
      location,
      phone,
      role,
      profilePhoto,
      city,
      state,
      country,
    } = registerData;

    // Create user (emailVerified is null by default - requires verification)
    const user = await this.db.user.create({
      data: {
        firstname,
        lastname,
        email,
        location,
        phone,
        role,
        profilePhoto,
        city,
        state,
        country,
        password: hashedPassword,
        emailVerifiedAt: null, // Explicitly set to null - requires verification
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
}
