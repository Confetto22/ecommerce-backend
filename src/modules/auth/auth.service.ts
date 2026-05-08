import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import * as crypto from 'crypto';
import { addHours } from 'date-fns';
import type { Response } from 'express';
import { TokenType } from 'generated/prisma/enums';
import ms, { type StringValue } from 'ms';
import { v4 as uuidv4 } from 'uuid';

import { CookieHelper } from 'src/common/utils/cookie-helper';
import type {
  JwtAccessPayload,
  JwtRefreshPayload,
} from 'src/common/interfaces/jwt-payload.interface';
import type { RefreshRequestUser } from 'src/common/types/auth-request.types';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

import { User } from '../user/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { MailService } from 'src/infrastructure/mail/mail.service';

const BCRYPT_COST = 12;
const PASSWORD_RESET_TTL_HOURS = 1;
const EMAIL_VERIFICATION_TTL_HOURS = 1;
const VERIFICATION_CODE_LENGTH = 6;
const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'If an account with that email exists, a password reset link has been sent.';
const GENERIC_SIGNUP_MESSAGE =
  'Registration successful. Please check your email to verify your account before logging in.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // ---------------------------------------------------------------------------
  // Signup
  // ---------------------------------------------------------------------------

  /**
   * Signup is intentionally enumeration-safe: it returns the same response
   * whether or not the email is already in use. When email is wired, the
   * "already registered" path should send a "you already have an account"
   * email instead of creating a new user.
   */
  async signup(registerData: SignupDto): Promise<{ message: string }> {
    const existing = await this.db.user.findUnique({
      where: { email: registerData.email },
      select: { id: true },
    });

    if (existing) {
      this.logger.warn(`Signup attempt for existing email`);
      return { message: GENERIC_SIGNUP_MESSAGE };
    }

    const hashedPassword = await hash(registerData.password, BCRYPT_COST);

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

    try {
      const code = await this.issueVerificationCode(user.id);
      void this.mailService
        .sendVerificationCode(user.email, user.username, code)
        .catch((err) => {
          this.logger.error(
            `Verification email failed for user ${user.id}`,
            err,
          );
        });
    } catch (err) {
      this.logger.error(
        `Failed to mint email verification token for user ${user.id}`,
        err,
      );
    }

    return { message: GENERIC_SIGNUP_MESSAGE };
  }

  // ---------------------------------------------------------------------------
  // Login + credential check
  // ---------------------------------------------------------------------------

  /**
   * Used by LocalStrategy. Logs the underlying reason for failures but only
   * surfaces a generic "credentials are not valid" to avoid user enumeration.
   */
  async verifyUser(email: string, password: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { email } });

    if (!user) {
      this.logger.debug(`Login failed: no user for email`);
      throw new UnauthorizedException('Credentials are not valid');
    }
    if (!user.password) {
      this.logger.warn(`Login failed: user has no password (OAuth-only?)`);
      throw new UnauthorizedException('Credentials are not valid');
    }

    const passwordMatch = await compare(password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Credentials are not valid');
    }

    return new User(user);
  }

  /**
   * Issues a fresh session + token pair, sets cookies, returns the
   * sanitized user. Caller is the controller; nothing else stays around.
   */
  async login(user: User, res: Response): Promise<{ user: User }> {
    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      user.role,
    );

    CookieHelper.setAccessTokenCookie(res, accessToken, this.configService);
    CookieHelper.setRefreshTokenCookie(res, refreshToken, this.configService);

    return { user };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  /**
   * Terminate the current session only. The session id comes from the refresh
   * cookie; we don't trust the access token to identify a session because it
   * doesn't carry one.
   */
  async logout(
    userId: string,
    refreshToken: string | undefined,
    res: Response,
  ): Promise<void> {
    if (refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(
          refreshToken,
          {
            secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          },
        );
        if (payload.tokenId && payload.sub === userId) {
          await this.db.session.deleteMany({
            where: { id: payload.tokenId, userId },
          });
        }
      } catch {
        // Expired or tampered refresh token: nothing to invalidate, just
        // clear cookies. Don't surface this to the client.
      }
    }

    CookieHelper.clearTokenCookies(res, this.configService);
  }

  /**
   * Terminate every session for the user (e.g., "log out everywhere",
   * post-password-reset, suspected compromise).
   */
  async logoutAll(userId: string, res: Response): Promise<void> {
    await this.db.session.deleteMany({ where: { userId } });
    CookieHelper.clearTokenCookies(res, this.configService);
  }

  // ---------------------------------------------------------------------------
  // Refresh + rotation + reuse detection
  // ---------------------------------------------------------------------------

  /**
   * Strategy-level verifier. Returns the minimal shape the controller needs.
   *
   * Reuse detection: if a refresh token's signature is valid but its session
   * is gone, OR its hash doesn't match the stored one, we assume token theft
   * and revoke every session for that user (RFC 6749 §10.4 / OWASP).
   */
  async verifyRefreshToken(
    rawRefreshToken: string | undefined,
    payload: JwtRefreshPayload,
  ): Promise<RefreshRequestUser> {
    if (!rawRefreshToken || !payload?.sub || !payload?.tokenId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.db.session.findUnique({
      where: { id: payload.tokenId },
    });

    if (!session || session.userId !== payload.sub) {
      this.logger.warn(
        `Refresh reuse detected (no session) for user ${payload.sub}; revoking all sessions`,
      );
      await this.invalidateAllSessions(payload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expires.getTime() <= Date.now()) {
      await this.db.session
        .delete({ where: { id: session.id } })
        .catch(() => {});
      throw new UnauthorizedException('Refresh token expired');
    }

    const stored = Buffer.from(session.sessionToken, 'hex');
    const expected = Buffer.from(this.hashToken(rawRefreshToken), 'hex');
    const hashesMatch =
      stored.length === expected.length &&
      stored.length > 0 &&
      crypto.timingSafeEqual(stored, expected);

    if (!hashesMatch) {
      this.logger.warn(
        `Refresh reuse detected (hash mismatch) for user ${payload.sub}; revoking all sessions`,
      );
      await this.invalidateAllSessions(payload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { userId: payload.sub, sessionId: session.id };
  }

  /**
   * Verify email address using verification token
   */
  async verifyEmail(
    email: string,
    code: string,
  ): Promise<{ success: boolean; message: string; user: User }> {
    // const trimmedCode = code.trim();
    // const validatedUserId = await this.validateVerificationCode(
    //   email,
    //   trimmedCode,
    // );

    const user = await this.db.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true, emailVerified: true },
    });

    if (!user) {
      // Don't reveal whether the email exists
      throw new UnauthorizedException('Invalid verification code');
    }

    if (user.emailVerified) {
      const fullUser = await this.db.user.findUnique({
        where: { id: user.id },
      });
      if (!fullUser) {
        throw new UnauthorizedException('Invalid verification code');
      }

      return {
        success: true,
        message: 'Email is already verified',
        user: new User(fullUser),
      };
    }

    await this.validateVerificationCode(user.id, code.trim());

    const fullUser = await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });

      await tx.token.deleteMany({
        where: {
          userId: user.id,
          type: TokenType.EMAIL_VERIFICATION,
        },
      });

      return tx.user.findUnique({
        where: { id: user.id },
      });
    });

    if (!fullUser) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Welcome email (non-blocking)
    this.mailService
      .sendWelcomeEmail(user.email, user.username)
      .catch((error) => {
        this.logger.warn('Failed to send welcome email:', error);
      });

    return {
      success: true,
      message: 'Email verified successfully',
      user: new User(fullUser),
    };
  }

  /**
   * Rotates the session: deletes the old one, issues a new pair tied to a
   * fresh session id, sets cookies, returns the sanitized user.
   *
   * Single rotation transaction for the delete + create would be ideal; we
   * keep it simple here and rely on reuse detection if the old token is
   * replayed before the new one lands client-side.
   */
  async refreshAccessToken(
    refresher: RefreshRequestUser,
    res: Response,
  ): Promise<{ user: User }> {
    const user = await this.db.user.findUnique({
      where: { id: refresher.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Atomic claim: only the request that wins the delete is allowed to
    // mint new tokens. A concurrent refresher will see P2025 here, which we
    // treat as a reuse signal and bail out cleanly.
    try {
      await this.db.session.delete({ where: { id: refresher.sessionId } });
    } catch {
      await this.invalidateAllSessions(refresher.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      user.role,
    );

    CookieHelper.setAccessTokenCookie(res, accessToken, this.configService);
    CookieHelper.setRefreshTokenCookie(res, refreshToken, this.configService);

    return { user: new User(user) };
  }

  // ---------------------------------------------------------------------------
  // Forgot / reset password
  // ---------------------------------------------------------------------------

  /**
   * Generates a password reset token (raw + hash), upserts a single active
   * row per user, and returns the *raw* token so the caller (you, when you
   * wire email) can email it. The DB only ever stores the hash.
   *
   * Returns null when the email maps to no eligible user. The caller should
   * still respond with a generic success message either way.
   */
  async forgotPassword(
    email: string,
  ): Promise<{ message: string; rawToken?: string; userId?: string }> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      // Don't reveal whether the user exists or how they signed up.
      return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const expires = addHours(new Date(), PASSWORD_RESET_TTL_HOURS);

    await this.db.token.upsert({
      where: {
        userId_type: { userId: user.id, type: TokenType.PASSWORD_RESET },
      },
      create: {
        token: hashedToken,
        type: TokenType.PASSWORD_RESET,
        userId: user.id,
        expires,
      },
      update: {
        token: hashedToken,
        expires,
      },
    });

    return {
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
      rawToken,
      userId: user.id,
    };
  }

  /**
   * Validates the *raw* token from the user, hashes it, looks up the row,
   * sets the new password, and burns every session belonging to the user.
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const userId = await this.consumePasswordResetToken(rawToken);

    const hashedPassword = await hash(newPassword, BCRYPT_COST);
    await this.db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Force re-login on every device after a reset.
    await this.invalidateAllSessions(userId);

    return { message: 'Password has been reset successfully' };
  }

  // ---------------------------------------------------------------------------
  // Maintenance helpers
  // ---------------------------------------------------------------------------

  /**
   * Best called by a scheduled job. Removes expired session and password
   * reset rows so they don't pile up forever.
   */
  async cleanupExpiredAuthRecords(): Promise<{
    sessions: number;
    tokens: number;
  }> {
    const now = new Date();
    const [sessions, tokens] = await this.db.$transaction([
      this.db.session.deleteMany({ where: { expires: { lt: now } } }),
      this.db.token.deleteMany({ where: { expires: { lt: now } } }),
    ]);
    return { sessions: sessions.count, tokens: tokens.count };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Creates a session row with a deterministic id, signs a refresh JWT
   * carrying that id, then stores the SHA-256 of the JWT in the session.
   * This makes the refresh JWT itself the secret — but only useful when
   * paired with the session row's hash, which we delete on rotation.
   */
  private async issueTokens(
    userId: string,
    role: User['role'],
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenId = uuidv4();

    const refreshTtlMs = this.durationFromConfig(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );

    const refreshToken = await this.signRefreshToken({ sub: userId, tokenId });
    const accessToken = await this.signAccessToken({ sub: userId, role });

    await this.db.session.create({
      data: {
        id: tokenId,
        userId,
        sessionToken: this.hashToken(refreshToken),
        expires: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { accessToken, refreshToken };
  }

  private async signAccessToken(payload: JwtAccessPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<StringValue>(
        'JWT_ACCESS_EXPIRATION',
      ),
    });
  }

  private async signRefreshToken(payload: JwtRefreshPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<StringValue>(
        'JWT_REFRESH_EXPIRATION',
      ),
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private durationFromConfig(key: string, fallback: StringValue): number {
    const raw = this.configService.get<string>(key) ?? fallback;
    const value = ms(raw as StringValue);
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Invalid duration for ${key}: "${raw}"`);
    }
    return value;
  }

  private async consumePasswordResetToken(rawToken: string): Promise<string> {
    const hashedToken = this.hashToken(rawToken);

    const tokenRecord = await this.db.token.findUnique({
      where: { token: hashedToken },
    });

    if (!tokenRecord || tokenRecord.type !== TokenType.PASSWORD_RESET) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    if (tokenRecord.expires.getTime() <= Date.now()) {
      await this.db.token
        .delete({ where: { id: tokenRecord.id } })
        .catch(() => {});
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    // Single-use: burn the token whether the rest of the flow succeeds
    // or fails — in either case we never want it reusable.
    await this.db.token.delete({ where: { id: tokenRecord.id } });

    return tokenRecord.userId;
  }

  private async invalidateAllSessions(userId: string): Promise<void> {
    await this.db.session.deleteMany({ where: { userId } });
  }

  /**
   * Validates a 6-digit verification code for a specific user.
   * Looks up by userId + type, then compares the code using timing-safe comparison.
   */
  async validateVerificationCode(
    userId: string,
    code: string,
  ): Promise<string> {
    const tokenRecord = await this.db.token.findUnique({
      where: {
        userId_type: { userId, type: TokenType.EMAIL_VERIFICATION },
      },
    });

    if (!tokenRecord) {
      throw new NotFoundException('Invalid or expired verification code');
    }

    if (tokenRecord.expires.getTime() <= Date.now()) {
      await this.db.token
        .delete({ where: { id: tokenRecord.id } })
        .catch(() => {});
      throw new UnauthorizedException(
        'Verification code has expired. Please request a new one.',
      );
    }

    // Timing-safe comparison to prevent timing attacks

    const storedBuffer = Buffer.from(tokenRecord.token);
    const inputBuffer = Buffer.from(
      code.padStart(VERIFICATION_CODE_LENGTH, '0'),
    );
    if (
      storedBuffer.length !== inputBuffer.length ||
      !crypto.timingSafeEqual(storedBuffer, inputBuffer)
    ) {
      throw new UnauthorizedException('Invalid verification code');
    }

    return tokenRecord.userId;
  }

  /**
   * Upserts a single email-verification code per user.
   * Stored in plain text — brute-force is mitigated by rate limiting + 1h TTL.
   * @returns 6-digit code to embed in the outbound email
   */
  private async issueVerificationCode(userId: string): Promise<string> {
    // crypto.randomInt is CSPRNG-backed, uniform distribution over [0, 1_000_000)
    const code = crypto
      .randomInt(0, 1_000_000)
      .toString()
      .padStart(VERIFICATION_CODE_LENGTH, '0');
    const expires = addHours(new Date(), EMAIL_VERIFICATION_TTL_HOURS);

    await this.db.token.upsert({
      where: {
        userId_type: { userId, type: TokenType.EMAIL_VERIFICATION },
      },
      create: {
        token: code,
        type: TokenType.EMAIL_VERIFICATION,
        userId,
        expires,
      },

      update: {
        token: code,
        expires,
      },
    });

    return code;
  }

  async resendVerificationCode(email: string): Promise<{ message: string }> {
    const user = await this.db.user.findUnique({
      where: {
        email,
      },
      select: { id: true, email: true, username: true, emailVerified: true },
    });

    // Don't reveal whether the user exists
    if (!user || user.emailVerified) {
      return {
        message:
          'If your email is registered and unverified, a new code has been sent.',
      };
    }

    const code = await this.issueVerificationCode(user.id);

    void this.mailService
      .sendVerificationCode(user.email, user.username, code)
      .catch((err) => {
        this.logger.error(
          `Resend verification code failed for user ${user.id}`,
          err,
        );
      });

    return {
      message:
        'If your email is registered and unverified, a new code has been sent.',
    };
  }
}
