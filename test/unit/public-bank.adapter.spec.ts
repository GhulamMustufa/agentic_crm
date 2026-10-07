import { describe, it, expect, beforeEach } from 'vitest';

import { PublicBankAdapter } from '../../src/modules/banking/parsers/adapters/public-bank.adapter';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('PublicBankAdapter', () => {
  let adapter: PublicBankAdapter;

  beforeEach(() => {
    adapter = new PublicBankAdapter();
  });

  describe('supports', () => {
    it('supports Public Bank detected bank and format', () => {
      const inspection = {
        detectedBank: 'PUBLIC_BANK',
        detectedFormat: 'PUBLIC_BANK_STATEMENT',
        bankDisplayName: 'Public Bank Berhad',
      } as DocumentInspectionResult;

      expect(adapter.supports(inspection)).toBe(true);
    });

    it('rejects unsupported banks', () => {
      const inspection = {
        detectedBank: 'CIMB',
        detectedFormat: 'CIMB_STANDARD_STATEMENT',
        bankDisplayName: 'CIMB Bank Berhad',
      } as DocumentInspectionResult;

      expect(adapter.supports(inspection)).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses cheque column and debit/credit columns accurately', async () => {
      const inspection: DocumentInspectionResult = {
        isValidPdf: true,
        isEncrypted: false,
        pageCount: 1,
        totalCharacters: 600,
        averageCharsPerPage: 600,
        isSearchableText: true,
        detectedBank: 'PUBLIC_BANK',
        bankDisplayName: 'Public Bank Berhad',
        detectedFormat: 'PUBLIC_BANK_STATEMENT',
        suggestedMode: 'NATIVE_TEXT',
        statementDate: '30/06/2026',
        accountNumber: '3123456789',
        confidence: 0.98,
        reasons: [],
      };

      const layout: StructuredDocumentLayout = {
        pageCount: 1,
        totalCharacters: 600,
        detectedBank: 'PUBLIC_BANK',
        detectedFormat: 'PUBLIC_BANK_STATEMENT',
        pages: [
          {
            pageNumber: 1,
            rawText:
              'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026\nBALANCE B/F: 20,000.00\nBALANCE C/F: 20,500.00',
            lines: [],
            tableLines: [
              'DATE  PARTICULARS  CHQ NO  DEBIT  CREDIT  BALANCE',
              '01/06/2026 CHEQUE WITHDRAWAL 882104 2,500.00 - 17,500.00',
              'PAYEE: ABC SUPPLIES SDN BHD',
              '03/06/2026 CASH DEPOSIT 3,000.00 20,500.00',
            ],
            metadataLines: [],
          },
        ],
      };

      const result = await adapter.parse(layout, inspection);

      expect(result.transactions).toHaveLength(2);

      // Tx 1: Debit 2,500.00 with cheque number 882104
      const tx1 = result.transactions[0];
      expect(tx1).toBeDefined();
      expect(tx1?.sourceSequence).toBe(1);
      expect(tx1?.date).toBe('2026-06-01');
      expect(tx1?.direction).toBe('DEBIT');
      expect(tx1?.amountCents).toBe(-250000n);
      expect(tx1?.signedAmountCents).toBe(-250000n);
      expect(tx1?.runningBalanceCents).toBe(1750000n);
      expect(tx1?.bankReference).toBe('882104');
      expect(tx1?.description).toContain('PAYEE: ABC SUPPLIES');

      // Tx 2: Credit 3,000.00
      const tx2 = result.transactions[1];
      expect(tx2).toBeDefined();
      expect(tx2?.sourceSequence).toBe(2);
      expect(tx2?.date).toBe('2026-06-03');
      expect(tx2?.direction).toBe('CREDIT');
      expect(tx2?.amountCents).toBe(300000n);
      expect(tx2?.runningBalanceCents).toBe(2050000n);

      // Balance checks
      expect(result.openingBalanceCents).toBe(2000000n);
      expect(result.closingBalanceCents).toBe(2050000n);
      expect(result.totalDebitsCents).toBe(250000n);
      expect(result.totalCreditsCents).toBe(300000n);
      expect(result.openingBalanceCents - result.totalDebitsCents + result.totalCreditsCents).toBe(
        result.closingBalanceCents,
      );
    });
  });
});
