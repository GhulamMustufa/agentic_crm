import { describe, it, expect } from 'vitest';

const LOCALE_BY_CURRENCY: Record<string, string> = {
  MYR: 'ms-MY',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  SGD: 'en-SG',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  AUD: 'en-AU',
  CAD: 'en-CA',
  INR: 'en-IN',
  AED: 'en-AE',
  SAR: 'en-SA',
  PKR: 'en-PK',
  CHF: 'de-CH',
};

function formatCurrency(amount: number, currency = 'USD'): string {
  const curr = (currency || 'USD').toUpperCase();
  const locale = LOCALE_BY_CURRENCY[curr] || 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
    }).format(amount);
  } catch {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: curr,
      }).format(amount);
    } catch {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    }
  }
}

describe('Multi-Currency Formatting Utility', () => {
  it('should format Malaysian Ringgit (MYR) with RM prefix', () => {
    const formatted = formatCurrency(1250.5, 'MYR');
    expect(formatted).toMatch(/RM/);
    expect(formatted).toContain('1,250.50');
  });

  it('should format US Dollar (USD) with dollar sign', () => {
    const formatted = formatCurrency(2500, 'USD');
    expect(formatted).toContain('$2,500.00');
  });

  it('should format Euro (EUR) properly', () => {
    const formatted = formatCurrency(300, 'EUR');
    expect(formatted).toMatch(/€/);
  });

  it('should format British Pound (GBP) with pound sign', () => {
    const formatted = formatCurrency(999.99, 'GBP');
    expect(formatted).toContain('£999.99');
  });

  it('should format Singapore Dollar (SGD)', () => {
    const formatted = formatCurrency(500, 'SGD');
    expect(formatted).toContain('500.00');
  });

  it('should format UAE Dirham (AED)', () => {
    const formatted = formatCurrency(1500, 'AED');
    expect(formatted).toMatch(/AED/);
  });

  it('should gracefully fall back to USD for invalid currency codes', () => {
    const formatted = formatCurrency(100, 'INVALID_CODE');
    expect(formatted).toContain('$100.00');
  });
});
