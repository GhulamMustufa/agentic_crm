import { describe, it, expect, beforeEach } from 'vitest';

import { CimbAdapter } from '../../src/modules/banking/parsers/adapters/cimb.adapter';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('CimbAdapter', () => {
  let adapter: CimbAdapter;

  beforeEach(() => {
    adapter = new CimbAdapter();
  });

  describe('supports', () => {
    it('supports CIMB detected bank and format', () => {
      const inspection = {
        detectedBank: 'CIMB',
        detectedFormat: 'CIMB_STANDARD_STATEMENT',
        bankDisplayName: 'CIMB Bank Berhad',
      } as DocumentInspectionResult;

      expect(adapter.supports(inspection)).toBe(true);
    });

    it('rejects unsupported banks', () => {
      const inspection = {
        detectedBank: 'MAYBANK',
        detectedFormat: 'MAYBANK_TRILINGUAL_STATEMENT',
        bankDisplayName: 'Malayan Banking Berhad',
      } as DocumentInspectionResult;

      expect(adapter.supports(inspection)).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses dual-amount columns and captures multi-line payee and reference', async () => {
      const inspection: DocumentInspectionResult = {
        isValidPdf: true,
        isEncrypted: false,
        pageCount: 1,
        totalCharacters: 600,
        averageCharsPerPage: 600,
        isSearchableText: true,
        detectedBank: 'CIMB',
        bankDisplayName: 'CIMB Bank Berhad',
        detectedFormat: 'CIMB_STANDARD_STATEMENT',
        suggestedMode: 'NATIVE_TEXT',
        statementDate: '30/06/2026',
        accountNumber: '8001234567',
        confidence: 0.98,
        reasons: [],
      };

      const layout: StructuredDocumentLayout = {
        pageCount: 1,
        totalCharacters: 600,
        detectedBank: 'CIMB',
        detectedFormat: 'CIMB_STANDARD_STATEMENT',
        pages: [
          {
            pageNumber: 1,
            rawText:
              'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026\nOPENING BALANCE: 10,000.00\nCLOSING BALANCE: 13,800.00',
            lines: [],
            tableLines: [
              'TARIKH / DATE  TRANSACTION DETAILS  WANG KELUAR (DR)  WANG MASUK (CR)  BAKI / BALANCE',
              '01/06/2026 INSTANT TRANSFER 1,200.00 - 8,800.00',
              'TO: SITI NURHALIZA',
              'REF: 2026060199991234',
              '05/06/2026 CLIENT PAYMENT - 5,000.00 13,800.00',
              'FR: MEGA HOLDINGS SDN BHD',
            ],
            metadataLines: [],
          },
        ],
      };

      const result = await adapter.parse(layout, inspection);

      expect(result.transactions).toHaveLength(2);

      // Transaction 1: Debit 1,200.00
      const tx1 = result.transactions[0];
      expect(tx1).toBeDefined();
      expect(tx1?.sourceSequence).toBe(1);
      expect(tx1?.date).toBe('2026-06-01');
      expect(tx1?.direction).toBe('DEBIT');
      expect(tx1?.amountCents).toBe(-120000n);
      expect(tx1?.signedAmountCents).toBe(-120000n);
      expect(tx1?.runningBalanceCents).toBe(880000n);
      expect(tx1?.description).toContain('TO: SITI NURHALIZA');
      expect(tx1?.bankReference).toBe('2026060199991234');
      expect(tx1?.sourceEvidence?.payeeFound).toBe(true);

      // Transaction 2: Credit 5,000.00
      const tx2 = result.transactions[1];
      expect(tx2).toBeDefined();
      expect(tx2?.sourceSequence).toBe(2);
      expect(tx2?.date).toBe('2026-06-05');
      expect(tx2?.direction).toBe('CREDIT');
      expect(tx2?.amountCents).toBe(500000n);
      expect(tx2?.signedAmountCents).toBe(500000n);
      expect(tx2?.runningBalanceCents).toBe(1380000n);

      // Mathematical balances
      expect(result.openingBalanceCents).toBe(1000000n);
      expect(result.closingBalanceCents).toBe(1380000n);
      expect(result.totalDebitsCents).toBe(120000n);
      expect(result.totalCreditsCents).toBe(500000n);
      expect(result.openingBalanceCents - result.totalDebitsCents + result.totalCreditsCents).toBe(
        result.closingBalanceCents,
      );
    });
  });
});
