import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtRefreshPayload } from 'src/common/interfaces/jwt-payload.interface';
import type { RefreshRequestUser } from 'src/common/types/auth-request.types';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request.cookies?.refreshToken ?? null,
      ]),
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  /**
   * Verifies the refresh token against the Session table (rotation + reuse
   * detection lives in `verifyRefreshToken`) and returns a minimal shape
   * for the controller. The raw refresh token never leaves this module.
   */
  async validate(
    request: Request,
    payload: JwtRefreshPayload,
  ): Promise<RefreshRequestUser> {
    const refreshToken: string | undefined = request.cookies?.refreshToken;
    return this.authService.verifyRefreshToken(refreshToken, payload);
  }
}
