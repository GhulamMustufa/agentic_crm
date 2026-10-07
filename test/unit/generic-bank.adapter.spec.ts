import { describe, it, expect, beforeEach } from 'vitest';

import { GenericBankAdapter } from '../../src/modules/banking/parsers/adapters/generic-bank.adapter';

import type {
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../../src/modules/banking/parsers/layout/layout.types';

describe('GenericBankAdapter', () => {
  let adapter: GenericBankAdapter;

  beforeEach(() => {
    adapter = new GenericBankAdapter();
  });

  it('parses structured layout lines into sequenced transactions and computes checksums', async () => {
    const layout: StructuredDocumentLayout = {
      pageCount: 1,
      totalCharacters: 400,
      detectedBank: 'UNKNOWN',
      detectedFormat: 'GENERIC_STATEMENT',
      pages: [
        {
          pageNumber: 1,
          rawText: `Statement Period: 2026-05-01 to 2026-05-31
Starting Balance: 10,000.00
Ending Balance: 11,500.00
2026-05-02 | CLIENT PAYMENT | 2,000.00
2026-05-15 | OFFICE SUPPLIES | -500.00`,
          lines: [
            'Statement Period: 2026-05-01 to 2026-05-31',
            'Starting Balance: 10,000.00',
            'Ending Balance: 11,500.00',
            '2026-05-02 | CLIENT PAYMENT | 2,000.00',
            '2026-05-15 | OFFICE SUPPLIES | -500.00',
          ],
          tableLines: [
            '2026-05-02 | CLIENT PAYMENT | 2,000.00',
            '2026-05-15 | OFFICE SUPPLIES | -500.00',
          ],
          metadataLines: [
            'Statement Period: 2026-05-01 to 2026-05-31',
            'Starting Balance: 10,000.00',
            'Ending Balance: 11,500.00',
          ],
        },
      ],
    };

    const inspection: DocumentInspectionResult = {
      isValidPdf: true,
      isEncrypted: false,
      pageCount: 1,
      totalCharacters: 400,
      averageCharsPerPage: 400,
      isSearchableText: true,
      detectedBank: 'UNKNOWN',
      bankDisplayName: 'Unknown Bank',
      detectedFormat: 'GENERIC_STATEMENT',
      suggestedMode: 'NATIVE_TEXT',
      confidence: 0.5,
      reasons: [],
    };

    const result = await adapter.parse(layout, inspection);

    expect(result.startDate).toBe('2026-05-01');
    expect(result.endDate).toBe('2026-05-31');
    expect(result.openingBalanceCents).toBe(1000000n);
    expect(result.closingBalanceCents).toBe(1150000n);
    expect(result.totalCreditsCents).toBe(200000n);
    expect(result.totalDebitsCents).toBe(50000n);
    expect(result.transactions).toHaveLength(2);

    const tx1 = result.transactions[0];
    const tx2 = result.transactions[1];

    expect(tx1).toBeDefined();
    if (tx1) {
      expect(tx1.date).toBe('2026-05-02');
      expect(tx1.direction).toBe('CREDIT');
      expect(tx1.amountCents).toBe(200000n);
      expect(tx1.sourceSequence).toBe(1);
    }

    expect(tx2).toBeDefined();
    if (tx2) {
      expect(tx2.date).toBe('2026-05-15');
      expect(tx2.direction).toBe('DEBIT');
      expect(tx2.amountCents).toBe(-50000n);
      expect(tx2.sourceSequence).toBe(2);
    }
  });
});
