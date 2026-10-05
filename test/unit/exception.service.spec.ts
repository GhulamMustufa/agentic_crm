import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AuditService } from '../../src/modules/audit/services/audit.service';
import { ExceptionType, ExceptionStatus, ResolutionAction } from '../../src/modules/exceptions/domain/exception.entity';
import { InMemoryExceptionRepository } from '../../src/modules/exceptions/repositories/in-memory-exception.repository';
import { ExceptionService } from '../../src/modules/exceptions/services/exception.service';

describe('ExceptionService', () => {
  let service: ExceptionService;
  let repo: InMemoryExceptionRepository;
  let auditService: AuditService;

  beforeEach(() => {
    repo = new InMemoryExceptionRepository();
    auditService = {
      log: vi.fn().mockResolvedValue(true),
    } as unknown as AuditService;

    service = new ExceptionService(repo, auditService);
  });

  it('should create an exception successfully', async () => {
    const dto = {
      type: ExceptionType.INVOICE_MISMATCH,
      context: { invoiceId: 'inv-123' },
      evidence: { expected: 100, actual: 90 },
      aiRecommendation: 'Approve variance',
      confidence: 85,
      reason: 'Total mismatch',
      availableActions: [ResolutionAction.APPROVE, ResolutionAction.REJECT],
    };

    const exception = await service.createException('tenant-1', dto);

    expect(exception.id).toBeDefined();
    expect(exception.status).toBe(ExceptionStatus.OPEN);
    expect(exception.tenantId).toBe('tenant-1');
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EXCEPTION_CREATED',
    }));
  });

  it('should resolve an exception and advance its status', async () => {
    const dto = {
      type: ExceptionType.DUPLICATE,
      context: {},
      evidence: {},
      aiRecommendation: 'Reject duplicate',
      confidence: 99,
      reason: 'Duplicate found',
      availableActions: [ResolutionAction.REJECT],
    };

    const exception = await service.createException('tenant-1', dto);

    const resolved = await service.resolveException('tenant-1', exception.id, 'user-1', {
      action: ResolutionAction.REJECT,
      notes: 'Confirmed duplicate',
    });

    expect(resolved.status).toBe(ExceptionStatus.RESOLVED);
    expect(resolved.resolutionAction).toBe(ResolutionAction.REJECT);
    expect(resolved.history?.length).toBe(2);
    expect(resolved.history?.[1]?.action).toBe(ResolutionAction.REJECT);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EXCEPTION_REJECT',
    }));
  });

  it('should reject invalid resolution actions', async () => {
    const dto = {
      type: ExceptionType.DUPLICATE,
      context: {},
      evidence: {},
      aiRecommendation: 'Reject duplicate',
      confidence: 99,
      reason: 'Duplicate found',
      availableActions: [ResolutionAction.REJECT],
    };

    const exception = await service.createException('tenant-1', dto);

    // Try to APPROVE when only REJECT is available
    await expect(
      service.resolveException('tenant-1', exception.id, 'user-1', { action: ResolutionAction.APPROVE })
    ).rejects.toThrow(/not available/);
  });
});
