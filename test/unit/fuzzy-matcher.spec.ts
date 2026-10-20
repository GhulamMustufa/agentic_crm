import { describe, it, expect } from 'vitest';

import {
  stripLegalSuffixes,
  levenshteinDistance,
  stringSimilarity,
  fuzzyContains,
  normalizeAlphanumeric,
} from '../../src/modules/banking/utils/fuzzy-matcher';

describe('Fuzzy Matcher & Entity Normalization Engine', () => {
  describe('stripLegalSuffixes', () => {
    it('should strip common US legal suffixes', () => {
      expect(stripLegalSuffixes('Starlight Technologies Inc.')).toBe('starlight');
      expect(stripLegalSuffixes('Cyberdyne Systems Corp')).toBe('cyberdyne systems');
      expect(stripLegalSuffixes('Acme Holdings LLC')).toBe('acme');
      expect(stripLegalSuffixes('Wayne Enterprises Co.')).toBe('wayne');
    });

    it('should strip international multi-word legal suffixes', () => {
      expect(stripLegalSuffixes('Maybank Islamic Berhad Sdn Bhd')).toBe('maybank islamic');
      expect(stripLegalSuffixes('GrabTaxi Holdings Pte Ltd')).toBe('grabtaxi');
      expect(stripLegalSuffixes('Siemens AG')).toBe('siemens');
      expect(stripLegalSuffixes('Bosch GmbH')).toBe('bosch');
    });

    it('should preserve root brand names without suffixes', () => {
      expect(stripLegalSuffixes('Stripe')).toBe('stripe');
      expect(stripLegalSuffixes('Uber')).toBe('uber');
      expect(stripLegalSuffixes('Staright Corp')).toBe('staright');
    });
  });

  describe('levenshteinDistance & stringSimilarity', () => {
    it('should compute zero distance and 1.0 similarity for identical strings', () => {
      expect(levenshteinDistance('starlight', 'starlight')).toBe(0);
      expect(stringSimilarity('starlight', 'starlight')).toBe(1.0);
    });

    it('should detect 1-character typos with high similarity (> 88%)', () => {
      // Missing 'l' in Starlight: Staright vs Starlight
      const distance = levenshteinDistance('staright', 'starlight');
      const similarity = stringSimilarity('staright', 'starlight');

      expect(distance).toBe(1);
      expect(similarity).toBeGreaterThanOrEqual(0.88);
    });

    it('should detect common transposition and substitution typos', () => {
      // 'Microsft' vs 'Microsoft'
      expect(stringSimilarity('microsft', 'microsoft')).toBeGreaterThanOrEqual(0.88);
      // 'Amzon' vs 'Amazon'
      expect(stringSimilarity('amzon', 'amazon')).toBeGreaterThanOrEqual(0.83);
    });

    it('should return low similarity for completely distinct strings', () => {
      expect(stringSimilarity('apple', 'google')).toBeLessThan(0.4);
      expect(stringSimilarity('stripe', 'uber')).toBeLessThan(0.2);
    });
  });

  describe('fuzzyContains', () => {
    it('should match exact company name in bank wire narrative', () => {
      const memo = 'WIRE TRANSFER FROM STARLIGHT CORP REF 8812';
      const result = fuzzyContains(memo, 'Starlight Corp');

      expect(result.match).toBe(true);
      expect(result.isExact).toBe(true);
      expect(result.similarity).toBe(1.0);
    });

    it('should match misspelled invoice counterparty ("Staright Corp") in bank memo ("STARLIGHT CORP")', () => {
      const memo = 'WIRE TRANSFER FROM STARLIGHT CORP REF 8812';
      // User typed "Staright Corp" on the invoice
      const result = fuzzyContains(memo, 'Staright Corp', 0.82);

      expect(result.match).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.85);
      expect(result.matchedToken).toBeDefined();
    });

    it('should match when bank statement has corporate suffixes not present on invoice', () => {
      const memo = 'TRANSFER FROM ACME TECH SDN BHD';
      const result = fuzzyContains(memo, 'Acme Tech');

      expect(result.match).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.95);
    });

    it('should reject unrelated counterparties', () => {
      const memo = 'WIRE TRANSFER FROM CITIBANK ASIA REF 9901';
      const result = fuzzyContains(memo, 'Staright Corp', 0.82);

      expect(result.match).toBe(false);
      expect(result.similarity).toBeLessThan(0.5);
    });
  });

  describe('normalizeAlphanumeric', () => {
    it('should strip punctuation, dashes, and whitespace from invoice references', () => {
      expect(normalizeAlphanumeric('INV-2026-001')).toBe('INV2026001');
      expect(normalizeAlphanumeric('INV # 9924')).toBe('INV9924');
      expect(normalizeAlphanumeric('BILL/OCT/12')).toBe('BILLOCT12');
    });
  });
});
