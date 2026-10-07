import { describe, expect, it } from 'vitest';

import { StatementValidationService } from '../../src/modules/banking/services/statement-validation.service';

import type { ParsedStatementResult } from '../../src/modules/banking/parsers/statement-parser.interface';

describe('StatementValidationService', () => {
  const service = new StatementValidationService();

  const createBaseStatement = (
    overrides?: Partial<ParsedStatementResult>,
  ): ParsedStatementResult => ({
    bankName: 'Maybank',
    accountNumberLast4: '5678',
    openingBalanceCents: 100000n, // RM 1,000.00
    closingBalanceCents: 130000n, // RM 1,300.00
    totalDebitsCents: 20000n, // RM 200.00
    totalCreditsCents: 50000n, // RM 500.00
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    transactions: [
      {
        date: '2026-01-05',
        description: 'CUSTOMER TRANSFER IN',
        amountCents: 50000n,
        runningBalanceCents: 150000n,
        pageNumber: 1,
        sourceSequence: 1,
        rawPrimaryText: '05/01/2026 CUSTOMER TRANSFER IN 500.00 1,500.00',
      },
      {
        date: '2026-01-15',
        description: 'OFFICE SUPPLIES',
        amountCents: -20000n,
        runningBalanceCents: 130000n,
        pageNumber: 1,
        sourceSequence: 2,
        rawPrimaryText: '15/01/2026 OFFICE SUPPLIES 200.00- 1,300.00',
      },
    ],
    ...overrides,
  });

  describe('Master Checksum Validation', () => {
    it('should validate a clean, mathematically balanced statement', () => {
      const statement = createBaseStatement();
      const result = service.validate(statement);

      expect(result.isValid).toBe(true);
      expect(result.checksumMatches).toBe(true);
      expect(result.runningBalanceContinuous).toBe(true);
      expect(result.summationMatches).toBe(true);
      expect(result.checksumDiscrepancyCents).toBe(0n);
      expect(result.calculatedClosingBalanceCents).toBe(130000n);
      expect(result.calculatedCreditsCents).toBe(50000n);
      expect(result.calculatedDebitsCents).toBe(20000n);
      expect(result.issues).toHaveLength(0);
      expect(result.failureSummary).toBeUndefined();
    });

    it('should detect checksum mismatch when reported closing balance is tampered or incorrect', () => {
      const statement = createBaseStatement({
        closingBalanceCents: 140000n, // RM 1,400.00 (diff +RM 100.00)
      });
      const result = service.validate(statement);

      expect(result.isValid).toBe(false);
      expect(result.checksumMatches).toBe(false);
      expect(result.checksumDiscrepancyCents).toBe(10000n);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'CHECKSUM_MISMATCH',
            severity: 'CRITICAL',
            discrepancyCents: 10000n,
          }),
        ]),
      );
      expect(result.failureSummary).toContain('Mathematical checksum failed');
    });

    it('should detect checksum failure when a transaction is missing or dropped', () => {
      const statement = createBaseStatement({
        // Drop the 2nd transaction (RM 200 debit)
        transactions: [
          {
            date: '2026-01-05',
            description: 'CUSTOMER TRANSFER IN',
            amountCents: 50000n,
            runningBalanceCents: 150000n,
            pageNumber: 1,
            sourceSequence: 1,
          },
        ],
      });
      const result = service.validate(statement);

      expect(result.isValid).toBe(false);
      expect(result.checksumMatches).toBe(false);
      // Calculated closing: 100000 + 50000 = 150000. Expected closing: 130000. Diff = -20000
      expect(result.checksumDiscrepancyCents).toBe(-20000n);
    });
  });

  describe('Step-by-Step Continuous Running Balance Verification', () => {
    it('should flag a critical issue if running balance breaks between transactions', () => {
      const statement = createBaseStatement({
        transactions: [
          {
            date: '2026-01-05',
            description: 'CUSTOMER TRANSFER IN',
            amountCents: 50000n,
            runningBalanceCents: 150000n,
            pageNumber: 1,
            sourceSequence: 1,
          },
          {
            date: '2026-01-15',
            description: 'OFFICE SUPPLIES',
            amountCents: -20000n,
            runningBalanceCents: 125000n, // Discrepancy: expected 130000, statement reports 125000
            pageNumber: 2,
            sourceSequence: 2,
          },
        ],
      });
      const result = service.validate(statement);

      expect(result.isValid).toBe(false);
      expect(result.runningBalanceContinuous).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'RUNNING_BALANCE_BREAK',
            severity: 'CRITICAL',
            sourceSequence: 2,
            expectedCents: 130000n,
            actualCents: 125000n,
            discrepancyCents: -5000n,
          }),
        ]),
      );
    });

    it('should infer initial balance if opening balance is zero and verify subsequent steps', () => {
      const statement = createBaseStatement({
        openingBalanceCents: 0n,
        closingBalanceCents: 30000n,
        totalDebitsCents: 20000n,
        totalCreditsCents: 50000n,
        transactions: [
          {
            date: '2026-01-05',
            description: 'CUSTOMER TRANSFER IN',
            amountCents: 50000n,
            runningBalanceCents: 150000n, // Inferred initial balance: 150000 - 50000 = 100000
            pageNumber: 1,
            sourceSequence: 1,
          },
          {
            date: '2026-01-15',
            description: 'OFFICE SUPPLIES',
            amountCents: -20000n,
            runningBalanceCents: 130000n, // 150000 - 20000 = 130000 (valid continuous step)
            pageNumber: 1,
            sourceSequence: 2,
          },
        ],
      });
      const result = service.validate(statement);

      // Running balance progression should pass
      expect(result.runningBalanceContinuous).toBe(true);
    });
  });

  describe('Summation and Boundary Checks', () => {
    it('should detect debit summation discrepancy against header reported total', () => {
      const statement = createBaseStatement({
        totalDebitsCents: 25000n, // Header reports 25000, but sum of transactions is 20000
      });
      const result = service.validate(statement);

      expect(result.isValid).toBe(false);
      expect(result.summationMatches).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'SUMMATION_MISMATCH',
            severity: 'HIGH',
            discrepancyCents: 5000n,
          }),
        ]),
      );
    });

    it('should detect credit summation discrepancy against header reported total', () => {
      const statement = createBaseStatement({
        totalCreditsCents: 60000n, // Header reports 60000, but sum of transactions is 50000
      });
      const result = service.validate(statement);

      expect(result.isValid).toBe(false);
      expect(result.summationMatches).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'SUMMATION_MISMATCH',
            severity: 'HIGH',
            discrepancyCents: 10000n,
          }),
        ]),
      );
    });

    it('should flag empty statement if opening balance does not match closing balance', () => {
      const statement = createBaseStatement({
        transactions: [],
        totalDebitsCents: 0n,
        totalCreditsCents: 0n,
        openingBalanceCents: 100000n,
        closingBalanceCents: 120000n,
      });
      const result = service.validate(statement);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'ZERO_TRANSACTIONS',
            severity: 'HIGH',
          }),
        ]),
      );
    });

    it('should flag transactions outside statement period', () => {
      const statement = createBaseStatement({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        transactions: [
          {
            date: '2025-05-10', // Prior year
            description: 'OLD TRANSACTION',
            amountCents: 50000n,
            runningBalanceCents: 150000n,
            pageNumber: 1,
            sourceSequence: 1,
          },
          {
            date: '2026-01-15',
            description: 'OFFICE SUPPLIES',
            amountCents: -20000n,
            runningBalanceCents: 130000n,
            pageNumber: 1,
            sourceSequence: 2,
          },
        ],
      });
      const result = service.validate(statement);

      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'DATE_OUT_OF_BOUNDS',
            severity: 'MEDIUM',
          }),
        ]),
      );
    });
  });

  describe('Audit Trail and Evidence Export', () => {
    it('should produce structured diagnostic audit evidence in both pass and fail states', () => {
      const statement = createBaseStatement();
      const result = service.validate(statement);

      expect(result.auditEvidence).toBeDefined();
      expect(result.auditEvidence.openingBalanceCents).toBe('100000');
      expect(result.auditEvidence.closingBalanceCents).toBe('130000');
      expect(result.auditEvidence.checksumMatches).toBe(true);
      expect(result.auditEvidence.runningBalanceContinuous).toBe(true);
      expect(result.auditEvidence.transactionCount).toBe(2);
    });
  });
});
