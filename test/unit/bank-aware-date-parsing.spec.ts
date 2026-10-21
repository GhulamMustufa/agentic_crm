import { describe, it, expect } from 'vitest';

import {
  normalizeDate,
  resolveDateFormatPreference,
  CsvStatementParser,
} from '../../src/modules/banking/parsers/csv-statement.parser';

describe('Bank-Aware & Locale-Aware Date Parsing', () => {
  describe('resolveDateFormatPreference', () => {
    it('should resolve MM/DD/YYYY for US institutions', () => {
      expect(resolveDateFormatPreference({ bankInstitution: 'JPMorgan Chase' })).toBe('MM/DD/YYYY');
      expect(resolveDateFormatPreference({ bankInstitution: 'Mercury Bank' })).toBe('MM/DD/YYYY');
      expect(resolveDateFormatPreference({ bankInstitution: 'Silicon Valley Bank' })).toBe(
        'MM/DD/YYYY',
      );
      expect(resolveDateFormatPreference({ bankInstitution: 'Wells Fargo NA' })).toBe('MM/DD/YYYY');
    });

    it('should resolve MM/DD/YYYY when currency is USD', () => {
      expect(resolveDateFormatPreference({ currency: 'USD' })).toBe('MM/DD/YYYY');
    });

    it('should resolve DD/MM/YYYY for Commonwealth and Southeast Asian institutions', () => {
      expect(resolveDateFormatPreference({ bankInstitution: 'Maybank Berhad' })).toBe('DD/MM/YYYY');
      expect(resolveDateFormatPreference({ bankInstitution: 'CIMB Bank' })).toBe('DD/MM/YYYY');
      expect(resolveDateFormatPreference({ bankInstitution: 'Public Bank' })).toBe('DD/MM/YYYY');
      expect(resolveDateFormatPreference({ bankInstitution: 'Barclays UK' })).toBe('DD/MM/YYYY');
      expect(resolveDateFormatPreference({ bankInstitution: 'HSBC' })).toBe('DD/MM/YYYY');
    });

    it('should honor explicit dateFormat override', () => {
      expect(
        resolveDateFormatPreference({ dateFormat: 'MM/DD/YYYY', bankInstitution: 'Maybank' }),
      ).toBe('MM/DD/YYYY');
      expect(
        resolveDateFormatPreference({ dateFormat: 'DD/MM/YYYY', bankInstitution: 'Chase' }),
      ).toBe('DD/MM/YYYY');
    });
  });

  describe('normalizeDate with Bank Context', () => {
    it('should parse ambiguous date 04/05/2026 as April 5th for US banks (Chase / Mercury)', () => {
      // In US: 04/05/2026 -> April 5th, 2026 (2026-04-05)
      const res = normalizeDate('04/05/2026', { bankInstitution: 'JPMorgan Chase' });
      expect(res).toBe('2026-04-05');

      const resMercury = normalizeDate('04/05/2026', { bankInstitution: 'Mercury' });
      expect(resMercury).toBe('2026-04-05');
    });

    it('should parse ambiguous date 04/05/2026 as May 4th for Commonwealth banks (Maybank / CIMB)', () => {
      // In Commonwealth: 04/05/2026 -> 4th May 2026 (2026-05-04)
      const res = normalizeDate('04/05/2026', { bankInstitution: 'Maybank' });
      expect(res).toBe('2026-05-04');

      const resCimb = normalizeDate('04/05/2026', { bankInstitution: 'CIMB' });
      expect(resCimb).toBe('2026-05-04');
    });

    it('should parse unambiguous dates correctly regardless of bank', () => {
      // 25/03/2026 is unambiguous (first > 12 -> DD/MM/YYYY)
      expect(normalizeDate('25/03/2026', { bankInstitution: 'Chase' })).toBe('2026-03-25');
      expect(normalizeDate('25/03/2026', { bankInstitution: 'Maybank' })).toBe('2026-03-25');

      // 03/25/2026 is unambiguous (second > 12 -> MM/DD/YYYY)
      expect(normalizeDate('03/25/2026', { bankInstitution: 'Chase' })).toBe('2026-03-25');
      expect(normalizeDate('03/25/2026', { bankInstitution: 'Maybank' })).toBe('2026-03-25');
    });

    it('should parse dash-formatted ambiguous dates based on institution', () => {
      expect(normalizeDate('04-05-2026', { bankInstitution: 'Chase' })).toBe('2026-04-05');
      expect(normalizeDate('04-05-2026', { bankInstitution: 'Maybank' })).toBe('2026-05-04');
    });
  });

  describe('CsvStatementParser Integration with Bank Institution Option', () => {
    it('should parse CSV statement with Chase bank institution using US date format', async () => {
      const parser = new CsvStatementParser();
      const csvContent = `Date,Description,Amount\n04/05/2026,CLIENT WIRE DEPOSIT,5000.00\n04/10/2026,AWS CLOUD,150.00-`;

      const result = await parser.parse(csvContent, { bankInstitution: 'Chase' });

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]?.date).toBe('2026-04-05'); // April 5th
      expect(result.transactions[1]?.date).toBe('2026-04-10'); // April 10th
    });

    it('should parse CSV statement with Maybank institution using Commonwealth date format', async () => {
      const parser = new CsvStatementParser();
      const csvContent = `Date,Description,Amount\n04/05/2026,CLIENT WIRE DEPOSIT,5000.00\n10/04/2026,OFFICE RENT,150.00-`;

      const result = await parser.parse(csvContent, { bankInstitution: 'Maybank' });

      expect(result.transactions).toHaveLength(2);
      // Chronologically sorted: 2026-04-10 is earlier than 2026-05-04
      expect(result.transactions[0]?.date).toBe('2026-04-10'); // April 10th
      expect(result.transactions[1]?.date).toBe('2026-05-04'); // May 4th
    });
  });
});
