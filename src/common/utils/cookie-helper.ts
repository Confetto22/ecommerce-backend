import type { Response, CookieOptions } from 'express';
import type { ConfigService } from '@nestjs/config';
import ms, { type StringValue } from 'ms';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

/**
 * Cookies are the only auth transport. Same SameSite/secure rules across
 * set / clear so the browser actually deletes them in production.
 */
function baseOptions(configService: ConfigService): CookieOptions {
  const isProduction =
    configService.getOrThrow<string>('NODE_ENV') === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };
}

function durationFromConfig(
  configService: ConfigService,
  key: string,
  fallback: StringValue,
): number {
  const raw = configService.get<string>(key) ?? fallback;
  const value = ms(raw as StringValue);
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(
      `Invalid duration for ${key}: "${raw}". Use values like "15m", "7d".`,
    );
  }
  return value;
}

export class CookieHelper {
  static setAccessTokenCookie(
    res: Response,
    token: string,
    configService: ConfigService,
  ): void {
    res.cookie(ACCESS_COOKIE, token, {
      ...baseOptions(configService),
      maxAge: durationFromConfig(configService, 'JWT_ACCESS_EXPIRATION', '15m'),
    });
  }

  static setRefreshTokenCookie(
    res: Response,
    token: string,
    configService: ConfigService,
  ): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...baseOptions(configService),
      maxAge: durationFromConfig(configService, 'JWT_REFRESH_EXPIRATION', '7d'),
    });
  }

  static clearTokenCookies(res: Response, configService: ConfigService): void {
    const opts = baseOptions(configService);
    res.clearCookie(ACCESS_COOKIE, opts);
    res.clearCookie(REFRESH_COOKIE, opts);
  }
}
