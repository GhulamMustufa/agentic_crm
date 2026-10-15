/**
 * Clean and normalize bank statement payee strings for clustering,
 * entity resolution, and rule learning.
 */
export function cleanBankPayee(raw: string): string {
  if (!raw) {
    return 'Unknown Payee';
  }

  // Extract quoted string if present: Unrecognized payee '...'
  const quotedMatch = raw.match(/['"]([^'"]+)['"]/);
  let text = quotedMatch && quotedMatch[1] ? quotedMatch[1] : raw;

  // Clean raw bank transfer prefixes
  text = text
    .replace(/^Reconciliation:\s*/i, '')
    .replace(/^TRANSFER (?:FR|TO) A\/C\s*\|\s*/i, '')
    .replace(/^DUITNOW (?:FR|TO|QR)\s*\|\s*/i, '')
    .replace(/^IBG (?:FR|TO)\s*\|\s*/i, '')
    .replace(/^PAYMENT (?:TO|FROM)\s*\|\s*/i, '')
    .replace(/^DIRECT DEBIT\s*\|\s*/i, '')
    .replace(/^DEBIT ADVICE\s*\|\s*/i, '')
    .replace(/^GIRO (?:CR|DR)\s*\|\s*/i, '');

  const parts = text
    .split(/[|*]/)
    .map((p) => p.trim())
    .filter(Boolean);
  let bestName = parts[0] || text;

  // Remove common banking noise words and reference identifiers
  bestName = bestName
    .replace(/\b(MBB|MAYBANK|MAE|CIMB|RHB|HLB|CT|IBG|Ais|Runner|Ref)\b/gi, '')
    .replace(/\d{6,}[A-Za-z]?/g, '')
    .replace(/[*_/-]+/g, ' ')
    .trim();

  if (!bestName || bestName.length < 2) {
    bestName = parts[0] || 'Unrecognized Transaction';
  }

  // Convert to Title Case
  return bestName
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
