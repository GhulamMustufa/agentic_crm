import { describe, it, expect, beforeEach } from 'vitest';

import { AmBankAdapter } from '../../src/modules/banking/parsers/adapters/ambank.adapter';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('AmBankAdapter', () => {
  let adapter: AmBankAdapter;

  beforeEach(() => {
    adapter = new AmBankAdapter();
  });

  describe('supports', () => {
    it('supports AmBank detected bank and format', () => {
      const inspection = {
        detectedBank: 'AMBANK',
        detectedFormat: 'AMBANK_STATEMENT',
        bankDisplayName: 'AmBank (M) Berhad',
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
    it('parses AmBank dual-column statement with continuous running balance and reference tracking', async () => {
      const inspection: DocumentInspectionResult = {
        isValidPdf: true,
        isEncrypted: false,
        pageCount: 1,
        totalCharacters: 600,
        averageCharsPerPage: 600,
        isSearchableText: true,
        detectedBank: 'AMBANK',
        bankDisplayName: 'AmBank (M) Berhad',
        detectedFormat: 'AMBANK_STATEMENT',
        suggestedMode: 'NATIVE_TEXT',
        statementDate: '30/06/2026',
        accountNumber: '8883001234567',
        confidence: 0.95,
        reasons: [],
      };

      const layout: StructuredDocumentLayout = {
        pageCount: 1,
        totalCharacters: 600,
        detectedBank: 'AMBANK',
        detectedFormat: 'AMBANK_STATEMENT',
        pages: [
          {
            pageNumber: 1,
            rawText: '',
            lines: [],
            metadataLines: [],
            tableLines: [
              'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026',
              'OPENING BALANCE: RM 50,000.00',
              '02/06/2026 DUITNOW QR TRANSFER 350.00 - 49,650.00',
              'REF: AMB9876543210',
              '10/06/2026 SUPPLIER INVOICE SETTLEMENT 5,000.00 - 44,650.00',
              'PAYEE: TECH SOLUTIONS SDN BHD',
              '20/06/2026 CLIENT SETTLEMENT - 12,000.00 56,650.00',
              'REF: 2026062000012345',
              'CLOSING BALANCE: RM 56,650.00',
            ],
          },
        ],
      };

      const result = await adapter.parse(layout, inspection);

      expect(result.startDate).toBe('2026-06-01');
      expect(result.endDate).toBe('2026-06-30');
      expect(result.openingBalanceCents).toBe(5000000n);
      expect(result.closingBalanceCents).toBe(5665000n);
      expect(result.transactions).toHaveLength(3);

      // Tx 1: Debit 350.00
      expect(result.transactions[0]?.date).toBe('2026-06-02');
      expect(result.transactions[0]?.amountCents).toBe(-35000n);
      expect(result.transactions[0]?.direction).toBe('DEBIT');
      expect(result.transactions[0]?.runningBalanceCents).toBe(4965000n);
      expect(result.transactions[0]?.referenceNumber).toBe('AMB9876543210');

      // Tx 2: Debit 5,000.00
      expect(result.transactions[1]?.date).toBe('2026-06-10');
      expect(result.transactions[1]?.amountCents).toBe(-500000n);
      expect(result.transactions[1]?.direction).toBe('DEBIT');
      expect(result.transactions[1]?.description).toContain('TECH SOLUTIONS SDN BHD');

      // Tx 3: Credit 12,000.00
      expect(result.transactions[2]?.date).toBe('2026-06-20');
      expect(result.transactions[2]?.amountCents).toBe(1200000n);
      expect(result.transactions[2]?.direction).toBe('CREDIT');
      expect(result.transactions[2]?.runningBalanceCents).toBe(5665000n);

      expect(result.totalDebitsCents).toBe(535000n);
      expect(result.totalCreditsCents).toBe(1200000n);
    });
  });
});
