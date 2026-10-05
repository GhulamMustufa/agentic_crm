import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { TenantContext, type TenantSessionContext } from '../../context/tenant-context.service';
import { AuthenticationError } from '../../errors/app-error';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { TokenService } from '../token.service';

import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: TenantSessionContext }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AuthenticationError('Token not provided');
    }

    const payload = this.tokenService.verifyAccessToken(token);
    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      'req_' + Math.random().toString(36).substring(2, 9);

    const sessionContext: TenantSessionContext = {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId || '',
      roleCode: payload.roleCode || 'USER',
      permissions: payload.permissions || [],
      correlationId,
    };

    request.user = sessionContext;

    // Run callback within TenantContext
    TenantContext.run(sessionContext, () => {});

    return true;
  }
}
