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
  | 'MISSING_RECEIPT';

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
  type: ExceptionType;
  reason: string;
  aiRecommendation?: string;
  context?: {
    amount?: number;
    severity?: 'high' | 'medium' | 'low';
  };
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export async function getPendingExceptions(): Promise<ExceptionItem[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/exceptions`, {
      headers: { 'x-tenant-id': 'default-tenant' },
      cache: 'no-store',
    });

    if (!res.ok) throw new Error('Failed to fetch exceptions');
    const data: RawExceptionDto[] = await res.json();

    return data.map((item) => ({
      id: item.id,
      date: item.createdAt,
      amount: item.context?.amount || 0,
      description: item.reason,
      type: item.type,
      severity: item.context?.severity || 'medium',
      aiProposal: item.aiRecommendation || '',
    }));
  } catch {
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
  const res = await fetch(`${BACKEND_URL}/exceptions/${id}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': 'default-tenant',
    },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error('Failed to resolve');
  return res.json();
}
