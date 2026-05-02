import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Returns whatever the active strategy attached to `req.user`.
 * - JwtAuthGuard       -> User
 * - LocalAuthGuard     -> User
 * - JwtRefreshAuthGuard -> RefreshRequestUser ({ userId, sessionId })
 *
 * The handler is responsible for typing the parameter to the right shape.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user;
  },
);
