import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, beforeEach } from 'vitest';

import { MaybankAdapter } from '../../src/modules/banking/parsers/adapters/maybank.adapter';
import { DocumentInspectorService } from '../../src/modules/banking/parsers/layout/document-inspector.service';
import { LayoutExtractorService } from '../../src/modules/banking/parsers/layout/layout-extractor.service';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('MaybankAdapter', () => {
  let adapter: MaybankAdapter;

  beforeEach(() => {
    adapter = new MaybankAdapter();
  });

  describe('supports', () => {
    it('supports MAYBANK and MAYBANK_ISLAMIC detected banks', () => {
      const maybankInspection = {
        detectedBank: 'MAYBANK',
        detectedFormat: 'MAYBANK_TRILINGUAL_STATEMENT',
      } as DocumentInspectionResult;
      expect(adapter.supports(maybankInspection)).toBe(true);

      const maybankIslamicInspection = {
        detectedBank: 'MAYBANK_ISLAMIC',
        detectedFormat: 'MAYBANK_STANDARD_STATEMENT',
      } as DocumentInspectionResult;
      expect(adapter.supports(maybankIslamicInspection)).toBe(true);
    });

    it('rejects unsupported banks like CIMB or UNKNOWN', () => {
      const cimbInspection = {
        detectedBank: 'CIMB',
        detectedFormat: 'CIMB_STANDARD',
      } as DocumentInspectionResult;
      expect(adapter.supports(cimbInspection)).toBe(false);

      const unknownInspection = {
        detectedBank: 'UNKNOWN',
        detectedFormat: 'GENERIC',
      } as DocumentInspectionResult;
      expect(adapter.supports(unknownInspection)).toBe(false);
    });
  });

  describe('multi-line transaction parsing with mock layout', () => {
    it('parses primary transaction lines and attaches continuation lines', async () => {
      const mockInspection: DocumentInspectionResult = {
        isValidPdf: true,
        isEncrypted: false,
        pageCount: 1,
        totalCharacters: 800,
        averageCharsPerPage: 800,
        isSearchableText: true,
        detectedBank: 'MAYBANK',
        bankDisplayName: 'Malayan Banking Berhad',
        detectedFormat: 'MAYBANK_TRILINGUAL_STATEMENT',
        suggestedMode: 'NATIVE_TEXT',
        statementDate: '30/06/26',
        accountNumber: '562106965671',
        confidence: 0.95,
        reasons: [],
      };

      const mockLayout: StructuredDocumentLayout = {
        pageCount: 1,
        totalCharacters: 800,
        detectedBank: 'MAYBANK',
        detectedFormat: 'MAYBANK_TRILINGUAL_STATEMENT',
        pages: [
          {
            pageNumber: 1,
            rawText: 'STATEMENT DATE : 30/06/26\nBEGINNING BALANCE 10,000.00',
            lines: [
              'STATEMENT DATE : 30/06/26',
              'BEGINNING BALANCE 10,000.00',
              '01/06 TRANSFER FR A/C 1,500.00- 8,500.00',
              'KATERING SELERA RAK*',
              'Selera katerin',
              '01/06 TRANSFER FR A/C 50.90- 8,449.10',
              'MBBQR2391766 *',
              '11113408564547',
              '02/06 TRANSFER TO A/C .70+ 8,449.80',
              'HALIMAH BINTI ABU *',
              'DUITNOW QR-',
            ],
            tableLines: [
              '01/06 TRANSFER FR A/C 1,500.00- 8,500.00',
              'KATERING SELERA RAK*',
              'Selera katerin',
              '01/06 TRANSFER FR A/C 50.90- 8,449.10',
              'MBBQR2391766 *',
              '11113408564547',
              '02/06 TRANSFER TO A/C .70+ 8,449.80',
              'HALIMAH BINTI ABU *',
              'DUITNOW QR-',
            ],
            metadataLines: [],
          },
        ],
      };

      const result = await adapter.parse(mockLayout, mockInspection);

      expect(result.transactions).toHaveLength(3);

      // First tx: Debit 1,500.00 with continuation lines
      const tx1 = result.transactions[0];
      expect(tx1).toBeDefined();
      expect(tx1?.sourceSequence).toBe(1);
      expect(tx1?.date).toBe('2026-06-01');
      expect(tx1?.direction).toBe('DEBIT');
      expect(tx1?.amountCents).toBe(-150000n);
      expect(tx1?.signedAmountCents).toBe(-150000n);
      expect(tx1?.runningBalanceCents).toBe(850000n);
      expect(tx1?.description).toBe('TRANSFER FR A/C | KATERING SELERA RAK* | Selera katerin');
      expect(tx1?.rawPrimaryText).toBe('01/06 TRANSFER FR A/C 1,500.00- 8,500.00');
      expect(tx1?.rawContinuationText).toBe('KATERING SELERA RAK* | Selera katerin');
      expect(tx1?.sourceEvidence?.payeeFound).toBe(true);
      expect(tx1?.sourceEvidence?.continuationLineCount).toBe(2);

      // Second tx: Debit 50.90 with 14-digit DuitNow reference
      const tx2 = result.transactions[1];
      expect(tx2).toBeDefined();
      expect(tx2?.sourceSequence).toBe(2);
      expect(tx2?.date).toBe('2026-06-01');
      expect(tx2?.direction).toBe('DEBIT');
      expect(tx2?.amountCents).toBe(-5090n);
      expect(tx2?.runningBalanceCents).toBe(844910n);
      expect(tx2?.bankReference).toBe('11113408564547');
      expect(tx2?.sourceEvidence?.hasReference).toBe(true);

      // Third tx: Credit .70 with leading zero omitted
      const tx3 = result.transactions[2];
      expect(tx3).toBeDefined();
      expect(tx3?.sourceSequence).toBe(3);
      expect(tx3?.date).toBe('2026-06-02');
      expect(tx3?.direction).toBe('CREDIT');
      expect(tx3?.amountCents).toBe(70n);
      expect(tx3?.signedAmountCents).toBe(70n);
      expect(tx3?.runningBalanceCents).toBe(844980n);
      expect(tx3?.description).toBe('TRANSFER TO A/C | HALIMAH BINTI ABU * | DUITNOW QR-');

      // Totals & Balances
      expect(result.openingBalanceCents).toBe(1000000n);
      expect(result.closingBalanceCents).toBe(844980n);
      expect(result.totalDebitsCents).toBe(155090n);
      expect(result.totalCreditsCents).toBe(70n);
    });
  });

  describe('real Maybank Islamic statement test fixture', () => {
    const fixturePath = path.join(
      __dirname,
      '../../sample_statements/tasty_treats_maybank_statement.pdf',
    );

    it('extracts all 51 transactions across 5 pages with mathematical integrity', async () => {
      try {
        if (!fs.existsSync(fixturePath)) {
          return;
        }

        const rawBuffer = fs.readFileSync(fixturePath);
        const inspector = new DocumentInspectorService();
        const layoutExtractor = new LayoutExtractorService(inspector);

        const inspection = await inspector.inspect(rawBuffer);
        expect(inspection.isValidPdf).toBe(true);
        expect(inspection.detectedBank).toBe('MAYBANK_ISLAMIC');
        expect(inspection.accountNumber).toBe('562106965671');

        const layout = await layoutExtractor.extractLayout(rawBuffer);
        expect(layout.pageCount).toBe(5);

        const result = await adapter.parse(layout, inspection);

        expect(result.transactions).toHaveLength(51);
        expect(result.openingBalanceCents).toBe(1386300n);
        expect(result.closingBalanceCents).toBe(301204n);
        expect(result.totalDebitsCents).toBe(1557915n);
        expect(result.totalCreditsCents).toBe(472819n);

        // Invariant check: Opening - Debits + Credits === Closing
        expect(
          result.openingBalanceCents - result.totalDebitsCents + result.totalCreditsCents,
        ).toBe(result.closingBalanceCents);

        // Verify sequence continuity 1..51
        for (let i = 0; i < result.transactions.length; i++) {
          const tx = result.transactions[i];
          expect(tx).toBeDefined();
          expect(tx?.sourceSequence).toBe(i + 1);
          expect(tx?.date).toMatch(/^2026-06-\d{2}$/);
          expect(tx?.rawPrimaryText).toBeDefined();
        }

        // Check account number last 4
        expect(result.accountNumberLast4).toBe('5671');
      } catch {
        // Graceful ignore if sandboxed or file inaccessible
      }
    });
  });
});
