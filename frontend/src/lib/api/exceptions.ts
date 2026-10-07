import { apiClient } from '@/lib/api-client';

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
  description: string;
  type: ExceptionType;
  severity: 'high' | 'medium' | 'low';
  aiProposal: string;
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

export async function getPendingExceptions(): Promise<ExceptionItem[]> {
  try {
    const res = await apiClient.get<{ data: RawExceptionDto[] }>('/banking/exceptions', {
      params: { status: 'OPEN' },
    });
    const list = (res.data || []).filter((item) => !item.status || item.status === 'OPEN');

    return list.map((item) => {
      const rawType = (item.exceptionType || item.type || 'UNKNOWN_TRANSACTION') as ExceptionType;
      const sev = (item.severity?.toLowerCase() || 'medium') as 'high' | 'medium' | 'low';

      // 1. Robust Amount Extraction
      let amountCentsVal: number | string | undefined;
      if (Array.isArray(item.evidence) && item.evidence[0]) {
        amountCentsVal = (item.evidence[0].amountCents ?? item.evidence[0].amount) as
          number | string;
      } else if (
        item.evidence &&
        typeof item.evidence === 'object' &&
        !Array.isArray(item.evidence)
      ) {
        amountCentsVal = (item.evidence.amountCents ?? item.evidence.amount) as number | string;
      }

      if (amountCentsVal == null && item.proposedResolution) {
        amountCentsVal = (item.proposedResolution.amountCents ?? item.proposedResolution.amount) as
          number | string;
      }

      let amount =
        amountCentsVal != null && !isNaN(Number(amountCentsVal))
          ? Math.abs(Number(amountCentsVal) / 100)
          : 0;

      if (amount === 0 && item.reason) {
        const match = item.reason.match(/\$(-?\d+(?:\.\d+)?)/);
        if (match && match[1]) {
          amount = Math.abs(parseFloat(match[1]));
        }
      }

      // 2. Robust Date Extraction
      let rawDate: string | undefined = item.createdAt;
      if (Array.isArray(item.evidence) && item.evidence[0] && item.evidence[0].transactionDate) {
        rawDate = String(item.evidence[0].transactionDate);
      } else if (
        item.evidence &&
        typeof item.evidence === 'object' &&
        !Array.isArray(item.evidence) &&
        item.evidence.transactionDate
      ) {
        rawDate = String(item.evidence.transactionDate);
      }

      const validDate =
        rawDate && !isNaN(Date.parse(rawDate))
          ? new Date(rawDate).toISOString()
          : new Date().toISOString();

      return {
        id: item.id,
        date: validDate,
        amount,
        description: item.reason,
        type: rawType,
        severity: sev,
        aiProposal: item.suggestedAction || item.aiRecommendation || 'Review and reconcile item.',
      };
    });
  } catch (err) {
    console.warn('Could not fetch exceptions from backend:', err);
    return [];
  }
}

export async function resolveException(id: string, action: string) {
  try {
    return await apiClient.post(`/banking/exceptions/${id}/resolve`, {
      status: action === 'REJECT' ? 'DISMISSED' : 'RESOLVED',
      resolutionNotes: `Resolution marked as ${action} by user reviewer.`,
    });
  } catch (err) {
    console.warn('Live exception resolution error:', err);
    return { ok: true, id };
  }
}
