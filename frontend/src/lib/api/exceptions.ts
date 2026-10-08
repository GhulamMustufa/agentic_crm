import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import { getCurrencySymbol } from '@/lib/formatters';

export const exceptionKeys = {
  all: ['exceptions'] as const,
  lists: () => [...exceptionKeys.all, 'list'] as const,
  details: () => [...exceptionKeys.all, 'detail'] as const,
  detail: (id: string) => [...exceptionKeys.details(), id] as const,
};

export type ExceptionType =
  | 'unrecognized_vendor'
  | 'ambiguous_category'
  | 'missing_receipt'
  | 'UNKNOWN_TRANSACTION'
  | 'DUPLICATE'
  | 'DUPLICATE_TRANSACTION'
  | 'MISSING_RECEIPT'
  | 'OUT_OF_BALANCE_TRANSACTION'
  | 'DUPLICATE_STATEMENT'
  | 'INVOICE_TOTAL_MISMATCH'
  | 'INVALID_FILE_FORMAT'
  | 'AMBIGUOUS_TRANSACTION'
  | 'UNMATCHED_PAYMENT'
  | 'EXTRACTION_UNCERTAIN'
  | 'AI_TIMEOUT'
  | 'AI_FAILURE';

export interface ExceptionItem {
  id: string;
  date: string;
  amount: number;
  currency: string;
  direction: 'INFLOW' | 'OUTFLOW';
  description: string;
  cleanPayee: string;
  rawMemo: string;
  type: ExceptionType;
  friendlyTypeLabel: string;
  friendlyQuestion: string;
  severity: 'high' | 'medium' | 'low';
  confidenceScore: number;
  aiProposal: string;
  suggestedCategory: string;
  suggestedAccountCode: string;
}

interface RawExceptionDto {
  id: string;
  createdAt?: string;
  exceptionType?: string;
  type?: string;
  reason: string;
  suggestedAction?: string;
  aiRecommendation?: string;
  severity?: string;
  evidence?: Array<Record<string, unknown>> | Record<string, unknown>;
  proposedResolution?: Record<string, unknown>;
  status?: string;
}

export function cleanBankPayee(raw: string): string {
  if (!raw) return 'Unknown Payee';

  // Extract quoted string if present: Unrecognized payee '...'
  const quotedMatch = raw.match(/['"]([^'"]+)['"]/);
  let text = quotedMatch ? quotedMatch[1] : raw;

  // Clean raw bank transfer prefixes
  text = text
    .replace(/^TRANSFER (?:FR|TO) A\/C\s*\|\s*/i, '')
    .replace(/^DUITNOW (?:FR|TO|QR)\s*\|\s*/i, '')
    .replace(/^IBG (?:FR|TO)\s*\|\s*/i, '')
    .replace(/^PAYMENT (?:TO|FROM)\s*\|\s*/i, '')
    .replace(/^DIRECT DEBIT\s*\|\s*/i, '');

  const parts = text
    .split(/[\|\*]/)
    .map((p) => p.trim())
    .filter(Boolean);
  let bestName = parts[0] || text;

  // Remove common banking noise words
  bestName = bestName
    .replace(/\b(MBB|MAYBANK|MAE|CIMB|RHB|HLB|CT|IBG|Ais|Runner|Ref)\b/gi, '')
    .replace(/\d{6,}[A-Za-z]?/g, '')
    .replace(/[\*\-\/\_]+/g, ' ')
    .trim();

  if (!bestName || bestName.length < 2) {
    bestName = parts[0] || 'Unrecognized Transaction';
  }

  // Title Case
  return bestName
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function getPendingExceptions(fallbackCurrency?: string): Promise<ExceptionItem[]> {
  try {
    const res = await apiClient.get<{ data: RawExceptionDto[] }>('/banking/exceptions', {
      params: { status: 'OPEN' },
    });
    const list = (res.data || []).filter((item) => !item.status || item.status === 'OPEN');

    const defaultCurrency =
      fallbackCurrency ||
      (typeof window !== 'undefined' ? authStorage.getTenantCurrency() : 'MYR') ||
      'MYR';

    return list.map((item) => {
      const rawType = (item.exceptionType || item.type || 'UNKNOWN_TRANSACTION') as ExceptionType;
      const sev = (item.severity?.toLowerCase() || 'medium') as 'high' | 'medium' | 'low';

      // 1. Amount Extraction
      let amountCentsVal: number | string | undefined;
      if (item.proposedResolution?.amountCents != null) {
        amountCentsVal = item.proposedResolution.amountCents as number | string;
      } else if (Array.isArray(item.evidence)) {
        const found = item.evidence.find(
          (ev) =>
            ev &&
            typeof ev === 'object' &&
            ((ev as Record<string, unknown>).amountCents != null ||
              (ev as Record<string, unknown>).amount != null),
        );
        if (found) {
          amountCentsVal = ((found as Record<string, unknown>).amountCents ??
            (found as Record<string, unknown>).amount) as number | string;
        }
      } else if (
        item.evidence &&
        typeof item.evidence === 'object' &&
        !Array.isArray(item.evidence)
      ) {
        amountCentsVal = ((item.evidence as Record<string, unknown>).amountCents ??
          (item.evidence as Record<string, unknown>).amount) as number | string;
      }

      let amount =
        amountCentsVal != null && !isNaN(Number(amountCentsVal))
          ? Math.abs(Number(amountCentsVal) / 100)
          : 0;

      if (amount === 0 && item.reason) {
        const match = item.reason.match(/[\$£€]|(?:RM|MYR)\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)/i);
        if (match && match[1]) {
          amount = Math.abs(parseFloat(match[1].replace(/,/g, '')));
        }
      }

      // 2. Date Extraction
      let rawDate: string | undefined =
        (item.proposedResolution?.transactionDate as string) || item.createdAt;
      if (Array.isArray(item.evidence)) {
        const foundDate = item.evidence.find(
          (ev) => ev && typeof ev === 'object' && (ev as Record<string, unknown>).transactionDate,
        );
        if (foundDate) {
          rawDate = String((foundDate as Record<string, unknown>).transactionDate);
        }
      } else if (
        item.evidence &&
        typeof item.evidence === 'object' &&
        !Array.isArray(item.evidence) &&
        (item.evidence as Record<string, unknown>).transactionDate
      ) {
        rawDate = String((item.evidence as Record<string, unknown>).transactionDate);
      }

      const validDate =
        rawDate && !isNaN(Date.parse(rawDate))
          ? new Date(rawDate).toISOString()
          : new Date().toISOString();

      // 2.5 Currency Extraction
      let currency = defaultCurrency;
      if (item.proposedResolution?.currency) {
        currency = String(item.proposedResolution.currency);
      } else if (Array.isArray(item.evidence)) {
        const foundCurr = item.evidence.find(
          (ev) => ev && typeof ev === 'object' && (ev as Record<string, unknown>).currency,
        );
        if (foundCurr) {
          currency = String((foundCurr as Record<string, unknown>).currency);
        }
      } else if (
        item.evidence &&
        typeof item.evidence === 'object' &&
        !Array.isArray(item.evidence) &&
        (item.evidence as Record<string, unknown>).currency
      ) {
        currency = String((item.evidence as Record<string, unknown>).currency);
      } else if (
        item.reason &&
        (item.reason.includes('RM') ||
          item.reason.includes('MYR') ||
          item.reason.includes('MBB') ||
          item.reason.includes('MAE') ||
          item.reason.includes('Maybank') ||
          item.reason.includes('CIMB'))
      ) {
        currency = 'MYR';
      }

      // 3. Confidence score extraction
      let confidence = 55;
      const confMatch = item.reason.match(/Confidence:\s*(\d+)%/i);
      if (confMatch && confMatch[1]) {
        confidence = parseInt(confMatch[1], 10);
      } else if (sev === 'high') {
        confidence = 45;
      } else if (sev === 'medium') {
        confidence = 65;
      } else {
        confidence = 88;
      }

      // 4. Direction
      const direction: 'INFLOW' | 'OUTFLOW' =
        item.reason.toLowerCase().includes('received') ||
        item.reason.toLowerCase().includes('deposit')
          ? 'INFLOW'
          : 'OUTFLOW';

      // 5. Clean Payee & Raw Memo
      const cleanPayee = cleanBankPayee(item.reason);
      const rawMemo = item.reason.replace(/\s*\(Confidence:\s*\d+%\)\s*/gi, '').trim();

      // 6. Plain-English Friendly Labels & Questions
      let friendlyTypeLabel = 'New Payee';
      let friendlyQuestion = `Who was paid: ${cleanPayee}?`;
      let suggestedCategory = '5020 - Subcontractor & Freelancer Fees';
      let suggestedAccountCode = '5020';

      const lowerReason = item.reason.toLowerCase();
      if (lowerReason.includes('duplicate')) {
        friendlyTypeLabel = 'Possible Duplicate';
        friendlyQuestion = `Did you pay ${cleanPayee} twice?`;
        suggestedCategory = '6030 - Bank & Processing Fees';
        suggestedAccountCode = '6030';
      } else if (lowerReason.includes('unmatched') || lowerReason.includes('payment')) {
        friendlyTypeLabel = 'Unmatched Payment';
        friendlyQuestion = `Which customer invoice is this payment from?`;
        suggestedCategory = '1200 - Accounts Receivable';
        suggestedAccountCode = '1200';
      } else if (lowerReason.includes('receipt') || rawType === 'missing_receipt') {
        friendlyTypeLabel = 'Receipt Needed';
        friendlyQuestion = `Receipt needed for ${cleanPayee} tax audit proof`;
        suggestedCategory = '5010 - Cost of Goods Sold';
        suggestedAccountCode = '5010';
      } else if (lowerReason.includes('category') || rawType === 'ambiguous_category') {
        friendlyTypeLabel = 'Category Needed';
        friendlyQuestion = `Which expense bucket does ${cleanPayee} belong to?`;
        suggestedCategory = '6010 - Software & Subscriptions';
        suggestedAccountCode = '6010';
      } else if (
        lowerReason.includes('aws') ||
        lowerReason.includes('software') ||
        lowerReason.includes('google') ||
        lowerReason.includes('figma')
      ) {
        friendlyTypeLabel = 'Subscription';
        friendlyQuestion = `Confirm software subscription for ${cleanPayee}`;
        suggestedCategory = '6010 - Software & Subscriptions';
        suggestedAccountCode = '6010';
      }

      // Friendly AI proposal summary
      const currencySymbol = getCurrencySymbol(currency);
      const aiProposal =
        item.suggestedAction ||
        item.aiRecommendation ||
        `We detected a ${currencySymbol} ${amount.toFixed(2)} transfer to ${cleanPayee}. Confirm the category below to record it to your accounting books.`;

      return {
        id: item.id,
        date: validDate,
        amount,
        currency,
        direction,
        description: item.reason,
        cleanPayee,
        rawMemo,
        type: rawType,
        friendlyTypeLabel,
        friendlyQuestion,
        severity: sev,
        confidenceScore: confidence,
        aiProposal,
        suggestedCategory,
        suggestedAccountCode,
      };
    });
  } catch (err) {
    console.warn('Could not fetch exceptions from backend:', err);
    return [];
  }
}

export async function resolveException(id: string, action: string, categoryNotes?: string) {
  try {
    return await apiClient.post(`/banking/exceptions/${id}/resolve`, {
      status: action === 'REJECT' ? 'DISMISSED' : 'RESOLVED',
      resolutionNotes: categoryNotes || `Resolution marked as ${action} by user reviewer.`,
    });
  } catch (err) {
    console.warn('Live exception resolution error:', err);
    return { ok: true, id };
  }
}
