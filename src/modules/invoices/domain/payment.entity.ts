export type PaymentType = 'DISBURSEMENT' | 'RECEIPT';
export type PaymentMethod = 'ACH' | 'WIRE' | 'CHECK' | 'CREDIT_CARD' | 'CASH';
export type PaymentStatus = 'CLEARED' | 'VOID';

export interface PaymentAllocationEntity {
  id: string;
  tenantId: string;
  paymentId: string;
  invoiceId: string;
  allocatedAmountCents: bigint;
  createdAt: Date;
}

export interface PaymentEntity {
  id: string;
  tenantId: string;
  counterpartyId: string;
  bankAccountId?: string;
  paymentAccountId: string; // Cash or Bank Account ID from Chart of Accounts
  journalEntryId?: string;
  paymentType: PaymentType;
  paymentDate: string; // YYYY-MM-DD
  amountCents: bigint;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  status: PaymentStatus;
  createdAt: Date;
  allocations: PaymentAllocationEntity[];
}
