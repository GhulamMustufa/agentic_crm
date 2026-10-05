import { describe, it, expect } from 'vitest';

import { TenantContext } from '@/core/context/tenant-context.service';
import { AuthenticationError } from '@/core/errors/app-error';

describe('TenantContext', () => {
  it('should throw AuthenticationError when accessing tenantId outside of run() scope', () => {
    const context = new TenantContext();
    expect(() => context.tenantId).toThrow(AuthenticationError);
  });

  it('should provide isolated tenant and user context within run() scope', () => {
    const context = new TenantContext();

    const result = TenantContext.run(
      {
        tenantId: 'tenant_123',
        userId: 'user_456',
        email: 'test@example.com',
        roleCode: 'CONTROLLER',
        permissions: ['journal:post'],
        correlationId: 'req_abc',
      },
      () => {
        expect(context.tenantId).toBe('tenant_123');
        expect(context.userId).toBe('user_456');
        expect(context.hasPermission('journal:post')).toBe(true);
        expect(context.hasPermission('payroll:approve')).toBe(false);
        return 'success';
      },
    );

    expect(result).toBe('success');
    // Once outside, context must be clear
    expect(() => context.tenantId).toThrow(AuthenticationError);
  });

  it('should maintain strict isolation between concurrent async contexts', async () => {
    const context = new TenantContext();

    const taskA = TenantContext.run(
      {
        tenantId: 'tenant_AAA',
        userId: 'user_AAA',
        email: 'a@example.com',
        roleCode: 'OWNER',
        permissions: [],
        correlationId: 'req_aaa',
      },
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        return context.tenantId;
      },
    );

    const taskB = TenantContext.run(
      {
        tenantId: 'tenant_BBB',
        userId: 'user_BBB',
        email: 'b@example.com',
        roleCode: 'BOOKKEEPER',
        permissions: [],
        correlationId: 'req_bbb',
      },
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return context.tenantId;
      },
    );

    const [resA, resB] = await Promise.all([taskA, taskB]);
    expect(resA).toBe('tenant_AAA');
    expect(resB).toBe('tenant_BBB');
  });
});
