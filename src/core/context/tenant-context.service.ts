import { AsyncLocalStorage } from 'async_hooks';

import { Injectable } from '@nestjs/common';

import { AuthenticationError } from '../errors/app-error';

export interface TenantSessionContext {
  tenantId: string;
  userId: string;
  email: string;
  roleCode: string;
  permissions: string[];
  correlationId: string;
}

@Injectable()
export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantSessionContext>();

  static run<T>(context: TenantSessionContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  static get current(): TenantSessionContext | undefined {
    return this.storage.getStore();
  }

  get tenantId(): string {
    const session = TenantContext.current;
    if (!session?.tenantId) {
      throw new AuthenticationError('Tenant context missing from execution scope');
    }
    return session.tenantId;
  }

  get userId(): string {
    const session = TenantContext.current;
    if (!session?.userId) {
      throw new AuthenticationError('User context missing from execution scope');
    }
    return session.userId;
  }

  get session(): TenantSessionContext {
    const session = TenantContext.current;
    if (!session) {
      throw new AuthenticationError('Active tenant session context not initialized');
    }
    return session;
  }

  hasPermission(permission: string): boolean {
    const session = TenantContext.current;
    if (!session) {
      return false;
    }
    if (session.roleCode === 'OWNER') {
      return true;
    }
    return session.permissions.includes(permission);
  }
}
