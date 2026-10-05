import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { TenantSessionContext } from '../../context/tenant-context.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantSessionContext | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: TenantSessionContext }>();
    return request.user;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: TenantSessionContext }>();
    return request.user?.tenantId;
  },
);
