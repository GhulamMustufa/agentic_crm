import { describe, it, expect, beforeEach } from 'vitest';

import { RhbAdapter } from '../../src/modules/banking/parsers/adapters/rhb.adapter';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('RhbAdapter', () => {
  let adapter: RhbAdapter;

  beforeEach(() => {
    adapter = new RhbAdapter();
  });

  describe('supports', () => {
    it('supports RHB detected bank and format', () => {
      const inspection = {
        detectedBank: 'RHB',
        detectedFormat: 'RHB_STATEMENT',
        bankDisplayName: 'RHB Bank Berhad',
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
    it('parses RHB statement rows and balances with high precision', async () => {
      const inspection: DocumentInspectionResult = {
        isValidPdf: true,
        isEncrypted: false,
        pageCount: 1,
        totalCharacters: 600,
        averageCharsPerPage: 600,
        isSearchableText: true,
        detectedBank: 'RHB',
        bankDisplayName: 'RHB Bank Berhad',
        detectedFormat: 'RHB_STATEMENT',
        suggestedMode: 'NATIVE_TEXT',
        statementDate: '30/06/2026',
        accountNumber: '21234567890',
        confidence: 0.98,
        reasons: [],
      };

      const layout: StructuredDocumentLayout = {
        pageCount: 1,
        totalCharacters: 600,
        detectedBank: 'RHB',
        detectedFormat: 'RHB_STATEMENT',
        pages: [
          {
            pageNumber: 1,
            rawText:
              'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026\nOPENING BALANCE: 10,000.00\nCLOSING BALANCE: 13,700.00',
            lines: [],
            tableLines: [
              'DATE  DESCRIPTION  DEBIT (RM)  CREDIT (RM)  BALANCE (RM)',
              '01/06/2026 DUITNOW TRANSFER 800.00 - 9,200.00',
              'RECIPIENT: MR TAN KENG HUAT',
              'REF: RHB987654321',
              '05/06/2026 INWARD REMITTANCE - 4,500.00 13,700.00',
              'SENDER: GLOBAL CORP PTE LTD',
            ],
            metadataLines: [],
          },
        ],
      };

      const result = await adapter.parse(layout, inspection);

      expect(result.transactions).toHaveLength(2);

      // Tx 1: Debit 800.00
      const tx1 = result.transactions[0];
      expect(tx1).toBeDefined();
      expect(tx1?.sourceSequence).toBe(1);
      expect(tx1?.date).toBe('2026-06-01');
      expect(tx1?.direction).toBe('DEBIT');
      expect(tx1?.amountCents).toBe(-80000n);
      expect(tx1?.signedAmountCents).toBe(-80000n);
      expect(tx1?.runningBalanceCents).toBe(920000n);
      expect(tx1?.bankReference).toBe('RHB987654321');
      expect(tx1?.description).toContain('RECIPIENT: MR TAN');

      // Tx 2: Credit 4,500.00
      const tx2 = result.transactions[1];
      expect(tx2).toBeDefined();
      expect(tx2?.sourceSequence).toBe(2);
      expect(tx2?.date).toBe('2026-06-05');
      expect(tx2?.direction).toBe('CREDIT');
      expect(tx2?.amountCents).toBe(450000n);
      expect(tx2?.runningBalanceCents).toBe(1370000n);

      // Math verification
      expect(result.openingBalanceCents).toBe(1000000n);
      expect(result.closingBalanceCents).toBe(1370000n);
      expect(result.totalDebitsCents).toBe(80000n);
      expect(result.totalCreditsCents).toBe(450000n);
      expect(result.openingBalanceCents - result.totalDebitsCents + result.totalCreditsCents).toBe(
        result.closingBalanceCents,
      );
    });
  });
});
