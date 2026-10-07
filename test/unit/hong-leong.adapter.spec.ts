import { describe, it, expect, beforeEach } from 'vitest';

import { HongLeongAdapter } from '../../src/modules/banking/parsers/adapters/hong-leong.adapter';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('HongLeongAdapter', () => {
  let adapter: HongLeongAdapter;

  beforeEach(() => {
    adapter = new HongLeongAdapter();
  });

  describe('supports', () => {
    it('supports Hong Leong detected bank and format', () => {
      const inspection = {
        detectedBank: 'HONG_LEONG',
        detectedFormat: 'HONG_LEONG_STATEMENT',
        bankDisplayName: 'Hong Leong Bank Berhad',
      } as DocumentInspectionResult;

      expect(adapter.supports(inspection)).toBe(true);
    });

    it('rejects unsupported banks', () => {
      const inspection = {
        detectedBank: 'RHB',
        detectedFormat: 'RHB_STATEMENT',
        bankDisplayName: 'RHB Bank Berhad',
      } as DocumentInspectionResult;

      expect(adapter.supports(inspection)).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Hong Leong statement rows and balances accurately', async () => {
      const inspection: DocumentInspectionResult = {
        isValidPdf: true,
        isEncrypted: false,
        pageCount: 1,
        totalCharacters: 600,
        averageCharsPerPage: 600,
        isSearchableText: true,
        detectedBank: 'HONG_LEONG',
        bankDisplayName: 'Hong Leong Bank Berhad',
        detectedFormat: 'HONG_LEONG_STATEMENT',
        suggestedMode: 'NATIVE_TEXT',
        statementDate: '30/06/2026',
        accountNumber: '1122334455',
        confidence: 0.98,
        reasons: [],
      };

      const layout: StructuredDocumentLayout = {
        pageCount: 1,
        totalCharacters: 600,
        detectedBank: 'HONG_LEONG',
        detectedFormat: 'HONG_LEONG_STATEMENT',
        pages: [
          {
            pageNumber: 1,
            rawText:
              'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026\nBALANCE B/F: 10,000.00\nBALANCE C/F: 11,600.00',
            lines: [],
            tableLines: [
              'DATE  DESCRIPTION  WITHDRAWALS (DR)  DEPOSITS (CR)  BALANCE',
              '01/06/2026 SUPPLIER PAYMENT 1,600.00 - 8,400.00',
              'REF: HLB88776655',
              '08/06/2026 MERCHANT SETTLEMENT - 3,200.00 11,600.00',
            ],
            metadataLines: [],
          },
        ],
      };

      const result = await adapter.parse(layout, inspection);

      expect(result.transactions).toHaveLength(2);

      // Tx 1: Debit 1,600.00
      const tx1 = result.transactions[0];
      expect(tx1).toBeDefined();
      expect(tx1?.sourceSequence).toBe(1);
      expect(tx1?.date).toBe('2026-06-01');
      expect(tx1?.direction).toBe('DEBIT');
      expect(tx1?.amountCents).toBe(-160000n);
      expect(tx1?.signedAmountCents).toBe(-160000n);
      expect(tx1?.runningBalanceCents).toBe(840000n);
      expect(tx1?.bankReference).toBe('HLB88776655');

      // Tx 2: Credit 3,200.00
      const tx2 = result.transactions[1];
      expect(tx2).toBeDefined();
      expect(tx2?.sourceSequence).toBe(2);
      expect(tx2?.date).toBe('2026-06-08');
      expect(tx2?.direction).toBe('CREDIT');
      expect(tx2?.amountCents).toBe(320000n);
      expect(tx2?.runningBalanceCents).toBe(1160000n);

      // Math verification
      expect(result.openingBalanceCents).toBe(1000000n);
      expect(result.closingBalanceCents).toBe(1160000n);
      expect(result.totalDebitsCents).toBe(160000n);
      expect(result.totalCreditsCents).toBe(320000n);
      expect(result.openingBalanceCents - result.totalDebitsCents + result.totalCreditsCents).toBe(
        result.closingBalanceCents,
      );
    });
  });
});
