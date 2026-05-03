import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { $Enums } from 'generated/prisma/browser';
import { Observable } from 'rxjs';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<$Enums.Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    // If no roles defined → allow
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role: $Enums.Role } }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    const allowed = requiredRoles.some((role) => user.role === role);
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
