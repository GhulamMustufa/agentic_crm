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
  NZD: 'en-NZ',
  HKD: 'zh-HK',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  THB: 'th-TH',
  IDR: 'id-ID',
  PHP: 'en-PH',
  VND: 'vi-VN',
  BRL: 'pt-BR',
  MXN: 'es-MX',
  ZAR: 'en-ZA',
  TRY: 'tr-TR',
};

function getDefaultCurrency(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('agentic_os_currency') || 'MYR';
  }
  return 'MYR';
}

export function formatCurrency(amount: number, currency?: string): string {
  const curr = (currency || getDefaultCurrency()).toUpperCase();
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
        currency: 'MYR',
      }).format(amount);
    }
  }
}

export function formatIsoDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getCurrencySymbol(currency?: string): string {
  const curr = (currency || getDefaultCurrency()).toUpperCase();
  switch (curr) {
    case 'MYR':
      return 'RM';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'SGD':
      return 'S$';
    case 'CAD':
      return 'C$';
    case 'AUD':
      return 'A$';
    case 'INR':
      return '₹';
    case 'PKR':
      return 'Rs';
    case 'JPY':
    case 'CNY':
      return '¥';
    case 'AED':
      return 'AED';
    default:
      return '$';
  }
}
