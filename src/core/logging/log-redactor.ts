export const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /jwt/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /ssn/i,
  /social[_-]?security/i,
  /tax[_-]?id/i,
  /card[_-]?number/i,
  /cvv/i,
  /credit[_-]?card/i,
];

export function maskAccountNumber(rawNumber: string): string {
  if (!rawNumber || rawNumber.length < 4) {
    return '****';
  }
  return `...${rawNumber.slice(-4)}`;
}

export function sanitizeLogData(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogData(item));
  }

  if (typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeLogData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return input;
}
