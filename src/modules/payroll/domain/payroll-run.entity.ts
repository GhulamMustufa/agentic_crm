export type PayrollRunStatus = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'POSTED' | 'CANCELLED';

export interface PayrollRunEntity {
  id: string;
  tenantId: string;
  accountingPeriodId: string;
  journalEntryId?: string;
  runNumber: string;
  payPeriodStart: string; // YYYY-MM-DD
  payPeriodEnd: string; // YYYY-MM-DD
  paymentDate: string; // YYYY-MM-DD
  totalGrossCents: bigint;
  totalTaxCents: bigint;
  totalDeductionsCents: bigint;
  totalNetCents: bigint;
  status: PayrollRunStatus;
  approvedByUserId?: string;
  approvedAt?: Date;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
