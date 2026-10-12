import { UnrecoverableError, type Job } from 'bullmq';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { StatementProcessor } from '../../src/modules/banking/queues/statement.processor';

import type { IObjectStorage } from '../../src/core/storage/storage.service';
import type { BankStatementEntity } from '../../src/modules/banking/domain/bank-statement.entity';
import type { BankProcessingService } from '../../src/modules/banking/services/bank-processing.service';

describe('StatementProcessor', () => {
  let processor: StatementProcessor;
  let bankProcessingServiceMock: Partial<BankProcessingService>;
  let storageServiceMock: Partial<IObjectStorage>;

  const mockStatement: BankStatementEntity = {
    id: 'stmt-001',
    tenantId: 'tenant-001',
    bankAccountId: 'bank-001',
    fileName: 'statement.pdf',
    fileSha256: 'hash123',
    mimeType: 'application/pdf',
    statementStartDate: '2026-06-01',
    statementEndDate: '2026-06-30',
    openingBalanceCents: 100000n,
    closingBalanceCents: 150000n,
    totalDebitsCents: 20000n,
    totalCreditsCents: 70000n,
    pageCount: 3,
    extractionMode: 'NATIVE_TEXT',
    bankDetected: 'MAYBANK',
    status: 'PARSED',
    retryCount: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    bankProcessingServiceMock = {
      processStatementUpload: vi.fn().mockResolvedValue({
        statement: mockStatement,
        transactions: [],
        proposals: [],
        exceptions: [],
        lineCount: 25,
        proposalsCount: 25,
        exceptionsCount: 0,
      }),
    };

    storageServiceMock = {
      getObject: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf content %%EOF')),
    };

    processor = new StatementProcessor(
      bankProcessingServiceMock as BankProcessingService,
      storageServiceMock as IObjectStorage,
    );
  });

  it('processes statement job and returns a lightweight bounded summary', async () => {
    const jobMock = {
      id: 'job-5',
      data: {
        tenantId: 'tenant-001',
        userId: 'user-001',
        dto: {
          bankAccountId: 'bank-001',
          fileName: 'statement.pdf',
          mimeType: 'application/pdf',
          objectKey: 'tenants/tenant-001/statement.pdf',
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<{
      tenantId: string;
      userId: string;
      dto: {
        bankAccountId: string;
        fileName: string;
        mimeType: 'application/pdf';
        objectKey: string;
      };
    }>;

    const result = (await processor.process(jobMock)) as Record<string, unknown>;

    expect(storageServiceMock.getObject).toHaveBeenCalledWith('tenants/tenant-001/statement.pdf');
    expect(bankProcessingServiceMock.processStatementUpload).toHaveBeenCalledWith(
      'tenant-001',
      'user-001',
      expect.objectContaining({
        fileName: 'statement.pdf',
        mimeType: 'application/pdf',
        // Verifies raw Buffer is passed directly instead of heavy base64 string
        content: expect.any(Buffer),
      }),
      expect.objectContaining({
        lightweightResult: true,
        jobId: 'job-5',
      }),
    );

    // Verify lightweight return payload
    expect(result).toEqual({
      statement: {
        id: 'stmt-001',
        fileName: 'statement.pdf',
        status: 'PARSED',
        statementStartDate: '2026-06-01',
        statementEndDate: '2026-06-30',
        pageCount: 3,
        totalDebitsCents: '20000',
        totalCreditsCents: '70000',
      },
      transactionCount: 25,
      proposalsCount: 25,
      exceptionsCount: 0,
    });
  });

  it('marks out-of-memory or allocation failures as UnrecoverableError to stop infinite retry loops', async () => {
    bankProcessingServiceMock.processStatementUpload = vi
      .fn()
      .mockRejectedValue(new Error('JavaScript heap out of memory during parsing'));

    const jobMock = {
      id: 'job-9',
      data: {
        tenantId: 'tenant-001',
        userId: 'user-001',
        dto: {
          fileName: 'massive-statement.pdf',
          mimeType: 'application/pdf',
          objectKey: 'tenants/tenant-001/massive.pdf',
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<{
      tenantId: string;
      userId: string;
      dto: {
        fileName: string;
        mimeType: 'application/pdf';
        objectKey: string;
      };
    }>;

    await expect(processor.process(jobMock)).rejects.toThrow(UnrecoverableError);
  });

  it('marks duplicate or validation errors as UnrecoverableError', async () => {
    bankProcessingServiceMock.processStatementUpload = vi
      .fn()
      .mockRejectedValue(
        new Error('Duplicate statement rejected: file matches existing statement'),
      );

    const jobMock = {
      id: 'job-10',
      data: {
        tenantId: 'tenant-001',
        userId: 'user-001',
        dto: {
          fileName: 'duplicate.pdf',
          mimeType: 'application/pdf',
          objectKey: 'tenants/tenant-001/dup.pdf',
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<{
      tenantId: string;
      userId: string;
      dto: {
        fileName: string;
        mimeType: 'application/pdf';
        objectKey: string;
      };
    }>;

    await expect(processor.process(jobMock)).rejects.toThrow(UnrecoverableError);
  });

  it('re-throws transient network or connection errors for BullMQ retries', async () => {
    bankProcessingServiceMock.processStatementUpload = vi
      .fn()
      .mockRejectedValue(new Error('ECONNRESET: Connection reset by database peer'));

    const jobMock = {
      id: 'job-11',
      data: {
        tenantId: 'tenant-001',
        userId: 'user-001',
        dto: {
          fileName: 'normal.pdf',
          mimeType: 'application/pdf',
          objectKey: 'tenants/tenant-001/normal.pdf',
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<{
      tenantId: string;
      userId: string;
      dto: {
        fileName: string;
        mimeType: 'application/pdf';
        objectKey: string;
      };
    }>;

    await expect(processor.process(jobMock)).rejects.toThrow('ECONNRESET');
  });
});
