/**
 * Fuzzy String Matching & Entity Normalization Engine
 *
 * Implements high-performance Levenshtein distance, corporate legal suffix stripping,
 * and multi-token fuzzy matching to resolve invoice typos and bank memo discrepancies.
 */

const COMMON_LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'llc',
  'l.l.c.',
  'ltd',
  'limited',
  'sdn bhd',
  'sdn. bhd.',
  'sdn',
  'bhd',
  'berhad',
  'pte ltd',
  'pte. ltd.',
  'pte',
  'gmbh',
  'ag',
  'sa',
  'srl',
  'co',
  'company',
  'holdings',
  'holding',
  'group',
  'services',
  'technologies',
  'technology',
  'tech',
  'solutions',
  'enterprises',
  'enterprise',
  'international',
  'intl',
  'global',
  'consulting',
  'ventures',
  'partners',
  'plc',
]);

/**
 * Removes standard corporate legal suffixes (e.g., 'Inc', 'LLC', 'Sdn Bhd', 'Technologies')
 * and normalizes whitespace/casing for cleaner entity comparison.
 */
export function stripLegalSuffixes(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let cleaned = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Iteratively strip multi-word and single-word legal suffixes from the end of the string
  let changed = true;
  while (changed) {
    changed = false;
    const words = cleaned.split(' ');
    if (words.length <= 1) {
      break;
    }

    // Check two-word suffixes (e.g., 'sdn bhd', 'pte ltd')
    if (words.length >= 2) {
      const lastTwo = `${words[words.length - 2]} ${words[words.length - 1]}`;
      if (COMMON_LEGAL_SUFFIXES.has(lastTwo)) {
        words.splice(words.length - 2, 2);
        cleaned = words.join(' ');
        changed = true;
        continue;
      }
    }

    // Check single-word suffix (e.g., 'inc', 'llc', 'corp')
    const lastWord = words[words.length - 1]!;
    if (COMMON_LEGAL_SUFFIXES.has(lastWord)) {
      words.pop();
      cleaned = words.join(' ');
      changed = true;
    }
  }

  return cleaned.trim();
}

/**
 * Strips all non-alphanumeric characters and converts to uppercase for raw token comparison.
 */
export function normalizeAlphanumeric(str: string): string {
  return (str || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Computes the Levenshtein distance between two strings using an optimized matrix buffer.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) {
    return bLen;
  }
  if (bLen === 0) {
    return aLen;
  }

  let prevRow = new Array<number>(bLen + 1);
  let currRow = new Array<number>(bLen + 1);

  for (let j = 0; j <= bLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    const aChar = a.charCodeAt(i - 1);

    for (let j = 1; j <= bLen; j++) {
      const bChar = b.charCodeAt(j - 1);
      const cost = aChar === bChar ? 0 : 1;

      currRow[j] = Math.min(
        currRow[j - 1]! + 1, // insertion
        prevRow[j]! + 1, // deletion
        prevRow[j - 1]! + cost, // substitution
      );
    }

    // Swap row references
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[bLen]!;
}

/**
 * Returns a normalized similarity score between 0.0 (completely distinct) and 1.0 (identical).
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a && !b) {
    return 1.0;
  }
  if (!a || !b) {
    return 0.0;
  }

  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();

  if (s1 === s2) {
    return 1.0;
  }

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - distance / maxLen);
}

export interface FuzzyMatchResult {
  match: boolean;
  similarity: number;
  matchedToken?: string;
  isExact: boolean;
  suffixStrippedSimilarity: number;
}

/**
 * Evaluates whether `needle` (e.g. counterparty name 'Staright Corp') is present
 * in `haystack` (e.g. bank memo 'WIRE TRANSFER FROM STARLIGHT CORP - REF 102')
 * accounting for spelling typos, additional memo words, and corporate legal suffixes.
 *
 * @param haystack The text to search in (e.g., bank transaction narrative)
 * @param needle The target entity to find (e.g., customer or vendor name)
 * @param threshold Minimum similarity threshold to accept (default: 0.82)
 */
export function fuzzyContains(
  haystack: string,
  needle: string,
  threshold = 0.82,
): FuzzyMatchResult {
  if (!haystack || !needle) {
    return {
      match: false,
      similarity: 0,
      isExact: false,
      suffixStrippedSimilarity: 0,
    };
  }

  const hClean = haystack
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nClean = needle
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Direct exact substring match
  if (hClean.includes(nClean)) {
    return {
      match: true,
      similarity: 1.0,
      matchedToken: nClean,
      isExact: true,
      suffixStrippedSimilarity: 1.0,
    };
  }

  // 2. Suffix-stripped comparison
  const hStripped = stripLegalSuffixes(hClean);
  const nStripped = stripLegalSuffixes(nClean);

  if (nStripped.length >= 3 && hStripped.includes(nStripped)) {
    return {
      match: true,
      similarity: 0.98,
      matchedToken: nStripped,
      isExact: false,
      suffixStrippedSimilarity: 1.0,
    };
  }

  // 3. Sliding window / tokenized fuzzy search
  // Break needle into word tokens
  const nTokens = nStripped.split(' ').filter((t) => t.length > 2);
  const hTokens = hStripped.split(' ').filter((t) => t.length > 2);

  // If needle is a multi-word phrase (e.g. 'Starlight Logistics'), check sliding window of same length
  const windowSize = nTokens.length;
  let bestSim = stringSimilarity(hStripped, nStripped);
  let bestToken = '';

  if (windowSize > 0 && hTokens.length >= windowSize) {
    for (let i = 0; i <= hTokens.length - windowSize; i++) {
      const windowPhrase = hTokens.slice(i, i + windowSize).join(' ');
      const sim = stringSimilarity(windowPhrase, nStripped);
      if (sim > bestSim) {
        bestSim = sim;
        bestToken = windowPhrase;
      }
    }
  }

  // Also check individual high-salience word tokens (first word is usually the unique brand name)
  if (nTokens.length > 0) {
    const brandToken = nTokens[0]!;
    for (const hToken of hTokens) {
      const tokenSim = stringSimilarity(hToken, brandToken);
      // Give weight to brand token similarity
      if (tokenSim >= 0.85 && tokenSim > bestSim) {
        bestSim = tokenSim;
        bestToken = hToken;
      }
    }
  }

  const isMatch = bestSim >= threshold;

  return {
    match: isMatch,
    similarity: Math.round(bestSim * 100) / 100,
    matchedToken: bestToken || undefined,
    isExact: false,
    suffixStrippedSimilarity: Math.round(stringSimilarity(hStripped, nStripped) * 100) / 100,
  };
}
