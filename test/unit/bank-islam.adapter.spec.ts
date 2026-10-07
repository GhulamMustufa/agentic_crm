import { describe, it, expect, beforeEach } from 'vitest';

import { BankIslamAdapter } from '../../src/modules/banking/parsers/adapters/bank-islam.adapter';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('BankIslamAdapter', () => {
  let adapter: BankIslamAdapter;

  beforeEach(() => {
    adapter = new BankIslamAdapter();
  });

  describe('supports', () => {
    it('supports Bank Islam detected bank and format', () => {
      const inspection = {
        detectedBank: 'BANK_ISLAM',
        detectedFormat: 'BANK_ISLAM_STATEMENT',
        bankDisplayName: 'Bank Islam Malaysia Berhad',
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
    it('parses Bank Islam Islamic format with debit/kredit columns and reference extraction', async () => {
      const inspection: DocumentInspectionResult = {
        isValidPdf: true,
        isEncrypted: false,
        pageCount: 1,
        totalCharacters: 600,
        averageCharsPerPage: 600,
        isSearchableText: true,
        detectedBank: 'BANK_ISLAM',
        bankDisplayName: 'Bank Islam Malaysia Berhad',
        detectedFormat: 'BANK_ISLAM_STATEMENT',
        suggestedMode: 'NATIVE_TEXT',
        statementDate: '30/06/2026',
        accountNumber: '12015010012345',
        confidence: 0.95,
        reasons: [],
      };

      const layout: StructuredDocumentLayout = {
        pageCount: 1,
        totalCharacters: 600,
        detectedBank: 'BANK_ISLAM',
        detectedFormat: 'BANK_ISLAM_STATEMENT',
        pages: [
          {
            pageNumber: 1,
            rawText: '',
            lines: [],
            metadataLines: [],
            tableLines: [
              'TEMPOH PENYATA: 01/06/2026 HINGGA 30/06/2026',
              'BAKI AWAL: RM 30,000.00',
              '05/06/2026 DUITNOW QR PAYMENT 150.00 - 29,850.00',
              'NO. RUJUKAN: BIMB123456789012',
              '12/06/2026 PEMBAYARAN TAWARRUQ 2,500.00 - 27,350.00',
              'PENERIMA: PERMODALAN ISLAMIK BHD',
              '25/06/2026 BAYARAN DITERIMA INV-990 - 10,000.00 37,350.00',
              'BAKI AKHIR: RM 37,350.00',
            ],
          },
        ],
      };

      const result = await adapter.parse(layout, inspection);

      expect(result.startDate).toBe('2026-06-01');
      expect(result.endDate).toBe('2026-06-30');
      expect(result.openingBalanceCents).toBe(3000000n);
      expect(result.closingBalanceCents).toBe(3735000n);
      expect(result.transactions).toHaveLength(3);

      // Tx 1: Debit 150.00
      expect(result.transactions[0]?.date).toBe('2026-06-05');
      expect(result.transactions[0]?.amountCents).toBe(-15000n);
      expect(result.transactions[0]?.direction).toBe('DEBIT');
      expect(result.transactions[0]?.runningBalanceCents).toBe(2985000n);
      expect(result.transactions[0]?.referenceNumber).toBe('BIMB123456789012');

      // Tx 2: Debit 2,500.00
      expect(result.transactions[1]?.date).toBe('2026-06-12');
      expect(result.transactions[1]?.amountCents).toBe(-250000n);
      expect(result.transactions[1]?.direction).toBe('DEBIT');
      expect(result.transactions[1]?.description).toContain('PERMODALAN ISLAMIK BHD');

      // Tx 3: Credit 10,000.00
      expect(result.transactions[2]?.date).toBe('2026-06-25');
      expect(result.transactions[2]?.amountCents).toBe(1000000n);
      expect(result.transactions[2]?.direction).toBe('CREDIT');
      expect(result.transactions[2]?.runningBalanceCents).toBe(3735000n);

      expect(result.totalDebitsCents).toBe(265000n);
      expect(result.totalCreditsCents).toBe(1000000n);
    });
  });
});
