export type ProposalStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'MODIFIED';

export type ProposalType =
  | 'INVOICE_MATCH'
  | 'VENDOR_PAYMENT'
  | 'TRANSFER'
  | 'REFUND'
  | 'EXPENSE_CLASSIFICATION'
  | 'REVENUE_CLASSIFICATION'
  | 'AMBIGUOUS';

export interface BatchAllocationItem {
  invoiceId: string;
  invoiceNumber: string;
  allocatedCents: string;
}

export interface AiDecisionEvidence {
  source: string;
  field?: string;
  matchedValue?: string;
  confidenceContribution?: number;
  reason?: string;
  // Phase B: Advanced Reconciliation metadata
  feeCents?: string;
  grossAmountCents?: string;
  feeAccountId?: string;
  feeAccountCode?: string;
  batchAllocations?: BatchAllocationItem[];
  remainingDueCents?: string;
  allocatedCents?: string;
  metadata?: Record<string, unknown>;
}

export interface ProposalEntity {
  id: string;
  tenantId: string;
  bankTransactionId: string;
  invoiceId?: string;
  counterpartyId?: string;
  proposalType: ProposalType;
  debitAccountId: string;
  creditAccountId: string;
  amountCents: bigint;
  confidenceScore: number; // 0.000 to 1.000
  evidence: AiDecisionEvidence[];
  rationale: string;
  status: ProposalStatus;
  autoPostEligible: boolean;
  postedJournalEntryId?: string;
  resolvedByUserId?: string;
  resolvedAt?: Date;
  createdAt: Date;
}
