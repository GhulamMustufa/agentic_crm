export const exceptionKeys = {
  all: ['exceptions'] as const,
  lists: () => [...exceptionKeys.all, 'list'] as const,
  details: () => [...exceptionKeys.all, 'detail'] as const,
  detail: (id: string) => [...exceptionKeys.details(), id] as const,
};

export type ExceptionType = "unrecognized_vendor" | "ambiguous_category" | "missing_receipt" | "UNKNOWN_TRANSACTION" | "DUPLICATE" | "MISSING_RECEIPT";

export interface ExceptionItem {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: ExceptionType;
  severity: "high" | "medium" | "low";
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
    severity?: "high" | "medium" | "low";
  };
}

export async function getPendingExceptions(): Promise<ExceptionItem[]> {
  const res = await fetch('http://localhost:3000/exceptions', {
    headers: { 'x-tenant-id': 'default-tenant' },
    cache: 'no-store'
  });
  
  if (!res.ok) throw new Error('Failed to fetch exceptions');
  const data: RawExceptionDto[] = await res.json();
  
  return data.map((item) => ({
    id: item.id,
    date: item.createdAt,
    amount: item.context?.amount || 0,
    description: item.reason,
    type: item.type,
    severity: item.context?.severity || "medium",
    aiProposal: item.aiRecommendation || "",
  }));
}

export async function resolveException(id: string, action: string) {
  const res = await fetch(`http://localhost:3000/exceptions/${id}/resolve`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': 'default-tenant' 
    },
    body: JSON.stringify({ action })
  });
  if (!res.ok) throw new Error('Failed to resolve');
  return res.json();
}
