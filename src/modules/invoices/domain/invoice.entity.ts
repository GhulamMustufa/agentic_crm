export type InvoiceType = 'BILL' | 'INVOICE';
export type InvoiceStatus = 'DRAFT' | 'APPROVED' | 'POSTED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

export interface InvoiceLineEntity {
  id: string;
  tenantId: string;
  invoiceId: string;
  accountId: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unitCostCents: bigint;
  totalCents: bigint;
  createdAt: Date;
}

export interface InvoiceEntity {
  id: string;
  tenantId: string;
  counterpartyId: string;
  counterparty?: { id: string; legalName: string; type: string };
  sourceDocumentId?: string;
  journalEntryId?: string;
  invoiceType: InvoiceType;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  currency: string;
  subtotalCents: bigint;
  taxCents: bigint;
  totalCents: bigint;
  amountDueCents: bigint;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  lines: InvoiceLineEntity[];
}
