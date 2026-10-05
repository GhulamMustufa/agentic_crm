import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthorizationError } from '../../errors/app-error';
import { ROLES_KEY } from '../decorators/auth.decorators';

import type { TenantSessionContext } from '../../context/tenant-context.service';
import type { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: TenantSessionContext }>();
    const user = request.user;

    if (!user) {
      throw new AuthorizationError('Authentication required before role verification');
    }

    // Owner role always has unrestricted authority
    if (user.roleCode === 'OWNER') {
      return true;
    }

    const hasRole = requiredRoles.includes(user.roleCode);
    if (!hasRole) {
      throw new AuthorizationError(
        `Role '${user.roleCode}' does not have required access: [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
