import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

export class CookieHelper {
  /**
   * Set access token cookie
   */
  static setAccessTokenCookie(
    res: Response,
    token: string,
    configService: ConfigService,
  ): void {
    const isProduction =
      configService.getOrThrow<string>('NODE_ENV') === 'production';
    const maxAge = 15 * 60 * 1000; // 15 minutes

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge,
      path: '/',
    });
  }

  /**
   * Set refresh token cookie
   * @param res - Express response object
   * @param token - Refresh token
   * @param configService - Config service for environment variables
   * @param rememberMe - If true, cookie expires in 90 days, otherwise 7 days
   */
  static setRefreshTokenCookie(
    res: Response,
    token: string,
    configService: ConfigService,
    rememberMe: boolean = false,
  ): void {
    const isProduction =
      configService.getOrThrow<string>('NODE_ENV') === 'production';
    const maxAge = rememberMe
      ? 90 * 24 * 60 * 60 * 1000 // 90 days
      : 7 * 24 * 60 * 60 * 1000; // 7 days

    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge,
      path: '/',
    });
  }

  /**
   * Clear both token cookies
   */
  static clearTokenCookies(res: Response, configService: ConfigService): void {
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
