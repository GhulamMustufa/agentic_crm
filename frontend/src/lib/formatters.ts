export function formatCurrency(amount: number, currency = 'USD'): string {
  const curr = currency.toUpperCase();
  const locale = curr === 'MYR' ? 'ms-MY' : curr === 'CNY' ? 'zh-CN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
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

export function formatIsoDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
