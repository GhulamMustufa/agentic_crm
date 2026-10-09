import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { PrismaService } from '@/core/prisma/prisma.service';
import type {
  CreateBankTransactionInput,
  CreateProposalInput,
  CreateExceptionInput,
} from '@/modules/banking/domain/banking.repository.interface';

import { PrismaBankingRepository } from '@/modules/banking/repositories/prisma-banking.repository';

interface MockPrismaBankTransaction {
  createManyAndReturn: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}

interface MockPrismaProposal {
  createManyAndReturn: ReturnType<typeof vi.fn>;
}

interface MockPrismaBankingExceptionItem {
  createManyAndReturn: ReturnType<typeof vi.fn>;
}

interface MockPrismaClient {
  tenant: {
    upsert: ReturnType<typeof vi.fn>;
  };
  bankTransaction: MockPrismaBankTransaction;
  proposal: MockPrismaProposal;
  bankingExceptionItem: MockPrismaBankingExceptionItem;
}

describe('PrismaBankingRepository (Batch Operations Unit Tests)', () => {
  let repository: PrismaBankingRepository;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        upsert: vi.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      bankTransaction: {
        createManyAndReturn: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      proposal: {
        createManyAndReturn: vi.fn(),
      },
      bankingExceptionItem: {
        createManyAndReturn: vi.fn(),
      },
    };

    repository = new PrismaBankingRepository(mockPrisma as unknown as PrismaService);
  });

  describe('createBankTransactions', () => {
    it('should chunk inputs and invoke createManyAndReturn with 1000 limit', async () => {
      const inputs: CreateBankTransactionInput[] = Array.from({ length: 2500 }, (_, i) => ({
        tenantId: 'tenant-1',
        bankStatementId: 'stmt-1',
        bankAccountId: 'acct-1',
        transactionDate: '2026-06-01',
        amountCents: 1000n,
        runningBalanceCents: 10000n,
        rawDescription: `Tx ${i + 1}`,
        sourceSequence: i + 1,
        transactionHash: `hash-${i + 1}`,
      }));

      mockPrisma.bankTransaction.createManyAndReturn.mockImplementation(
        ({ data }: { data: Record<string, unknown>[] }) =>
          data.map((d, idx) => ({
            ...d,
            id: `id-${idx}`,
            createdAt: new Date(),
          })),
      );

      const result = await repository.createBankTransactions(inputs);

      expect(mockPrisma.bankTransaction.createManyAndReturn).toHaveBeenCalledTimes(3);
      expect(result.length).toBe(2500);
      expect(mockPrisma.tenant.upsert).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when inputs is empty', async () => {
      const result = await repository.createBankTransactions([]);
      expect(result).toEqual([]);
      expect(mockPrisma.bankTransaction.createManyAndReturn).not.toHaveBeenCalled();
    });
  });

  describe('findBankTransactionsByHashes', () => {
    it('should chunk hashes and return a map of found transactions', async () => {
      const hashes = Array.from({ length: 2100 }, (_, i) => `hash-${i}`);
      mockPrisma.bankTransaction.findMany.mockImplementation(
        ({ where }: { where: { transactionHash: { in: string[] } } }) =>
          where.transactionHash.in.slice(0, 10).map((h) => ({
            id: `id-${h}`,
            tenantId: 'tenant-1',
            bankStatementId: 'stmt-1',
            bankAccountId: 'acct-1',
            pageNumber: 1,
            sourceSequence: 1,
            sourceRowIndex: 0,
            transactionDate: new Date('2026-06-01'),
            direction: 'DEBIT',
            amountCents: 1000n,
            signedAmountCents: 1000n,
            rawDescription: 'Test',
            extractionMethod: 'NATIVE_LAYOUT',
            extractionConfidence: 1.0,
            riskLevel: 'LOW',
            transactionHash: h,
            status: 'UNRECONCILED',
            createdAt: new Date(),
          })),
      );

      const map = await repository.findBankTransactionsByHashes('tenant-1', 'acct-1', hashes);

      expect(mockPrisma.bankTransaction.findMany).toHaveBeenCalledTimes(3);
      expect(map.size).toBe(30);
    });

    it('should return empty map when hashes array is empty', async () => {
      const map = await repository.findBankTransactionsByHashes('tenant-1', 'acct-1', []);
      expect(map.size).toBe(0);
      expect(mockPrisma.bankTransaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('updateTransactionStatuses', () => {
    it('should chunk ids and call updateMany with PROPOSED status', async () => {
      const ids = Array.from({ length: 2500 }, (_, i) => `tx-${i}`);
      mockPrisma.bankTransaction.updateMany.mockResolvedValue({ count: 1000 });

      await repository.updateTransactionStatuses('tenant-1', ids, 'PROPOSED');

      expect(mockPrisma.bankTransaction.updateMany).toHaveBeenCalledTimes(3);
    });

    it('should not call updateMany if ids is empty', async () => {
      await repository.updateTransactionStatuses('tenant-1', [], 'PROPOSED');
      expect(mockPrisma.bankTransaction.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('createProposals', () => {
    it('should chunk inputs and create proposals in batch', async () => {
      const inputs: CreateProposalInput[] = Array.from({ length: 1500 }, (_, i) => ({
        tenantId: 'tenant-1',
        bankTransactionId: `tx-${i}`,
        proposalType: 'EXPENSE_CLASSIFICATION',
        debitAccountId: 'acc-debit',
        creditAccountId: 'acc-credit',
        amountCents: 5000n,
        confidenceScore: 0.9,
        evidence: [],
        rationale: 'Test',
        autoPostEligible: false,
      }));

      mockPrisma.proposal.createManyAndReturn.mockImplementation(
        ({ data }: { data: Record<string, unknown>[] }) =>
          data.map((d, idx) => ({
            ...d,
            id: `prop-${idx}`,
            createdAt: new Date(),
          })),
      );

      const results = await repository.createProposals(inputs);

      expect(mockPrisma.proposal.createManyAndReturn).toHaveBeenCalledTimes(2);
      expect(results.length).toBe(1500);
    });
  });

  describe('createExceptionItems', () => {
    it('should chunk inputs and create exceptions in batch', async () => {
      const inputs: CreateExceptionInput[] = Array.from({ length: 1200 }, (_, i) => ({
        tenantId: 'tenant-1',
        entityType: 'PROPOSAL',
        entityId: `prop-${i}`,
        exceptionType: 'AMBIGUOUS_TRANSACTION',
        severity: 'MEDIUM',
        reason: 'Ambiguous',
      }));

      mockPrisma.bankingExceptionItem.createManyAndReturn.mockImplementation(
        ({ data }: { data: Record<string, unknown>[] }) =>
          data.map((d, idx) => ({
            ...d,
            id: `exc-${idx}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
      );

      const results = await repository.createExceptionItems(inputs);

      expect(mockPrisma.bankingExceptionItem.createManyAndReturn).toHaveBeenCalledTimes(2);
      expect(results.length).toBe(1200);
    });
  });
});
