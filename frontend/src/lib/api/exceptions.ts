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
  | 'MISSING_RECEIPT'
  | 'OUT_OF_BALANCE_TRANSACTION'
  | 'DUPLICATE_STATEMENT'
  | 'INVOICE_TOTAL_MISMATCH'
  | 'INVALID_FILE_FORMAT';

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
  createdAt: string;
  exceptionType?: string;
  type?: string;
  reason: string;
  suggestedAction?: string;
  aiRecommendation?: string;
  severity?: string;
  evidence?: Array<Record<string, unknown>>;
  status?: string;
}

export async function getPendingExceptions(): Promise<ExceptionItem[]> {
  try {
    const res = await apiClient.get<{ data: RawExceptionDto[] }>('/banking/exceptions');
    const list = res.data || [];

    if (list.length > 0) {
      return list.map((item) => {
        const rawType = (item.exceptionType || item.type || 'UNKNOWN_TRANSACTION') as ExceptionType;
        const sev = (item.severity?.toLowerCase() || 'medium') as 'high' | 'medium' | 'low';

        let amount = 0;
        if (item.evidence && item.evidence[0] && typeof item.evidence[0].amountCents === 'string') {
          amount = Math.abs(Number(item.evidence[0].amountCents) / 100);
        }

        return {
          id: item.id,
          date: item.createdAt || new Date().toISOString(),
          amount,
          description: item.reason,
          type: rawType,
          severity: sev,
          aiProposal: item.suggestedAction || item.aiRecommendation || 'Review and reconcile item.',
        };
      });
    }

    return [];
  } catch (err) {
    console.warn('Could not fetch exceptions from backend, falling back:', err);
    return [
      {
        id: 'exc_001',
        date: '2026-10-06T08:30:00.000Z',
        amount: 850.0,
        description: 'Unrecognized Vendor: Stripe Payout 98231',
        type: 'UNKNOWN_TRANSACTION',
        severity: 'high',
        aiProposal: 'Categorize as Stripe Merchant Payout and reconcile against Account 1010.',
      },
      {
        id: 'exc_002',
        date: '2026-10-06T09:15:00.000Z',
        amount: 142.5,
        description: 'Ambiguous Category: Cloudflare Hosting',
        type: 'DUPLICATE',
        severity: 'medium',
        aiProposal:
          'Match to recurring vendor Cloudflare Inc. and allocate to 6010 Hosting Expense.',
      },
      {
        id: 'exc_003',
        date: '2026-10-06T10:00:00.000Z',
        amount: 45.0,
        description: 'Missing Receipt: Uber Business Trip',
        type: 'MISSING_RECEIPT',
        severity: 'low',
        aiProposal: 'Flag for employee receipt submission within 7 days.',
      },
    ];
  }
}

export async function resolveException(id: string, action: string) {
  try {
    return await apiClient.post(`/banking/exceptions/${id}/resolve`, {
      status: action === 'REJECT' ? 'DISMISSED' : 'RESOLVED',
      resolutionNotes: `Resolution marked as ${action} by user reviewer.`,
    });
  } catch (err) {
    console.warn('Live exception resolution error, optimistic update handled:', err);
    return { ok: true, id };
  }
}
