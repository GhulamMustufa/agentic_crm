import type { InvoiceEntity, InvoiceStatus, InvoiceType } from './invoice.entity';
import type { PaymentEntity, PaymentAllocationEntity } from './payment.entity';

export const INVOICE_REPOSITORY_TOKEN = Symbol('INVOICE_REPOSITORY_TOKEN');

export interface CreateInvoiceInput {
  tenantId: string;
  counterpartyId: string;
  sourceDocumentId?: string;
  invoiceType: InvoiceType;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotalCents: bigint;
  taxCents: bigint;
  totalCents: bigint;
  amountDueCents: bigint;
  lines: Array<{
    accountId: string;
    lineNumber: number;
    description: string;
    quantity: number;
    unitCostCents: bigint;
    totalCents: bigint;
  }>;
}

export interface CreatePaymentInput {
  tenantId: string;
  counterpartyId: string;
  bankAccountId?: string;
  paymentAccountId: string;
  paymentType: PaymentEntity['paymentType'];
  paymentDate: string;
  amountCents: bigint;
  paymentMethod: PaymentEntity['paymentMethod'];
  referenceNumber?: string;
  allocations?: Array<{
    invoiceId: string;
    allocatedAmountCents: bigint;
  }>;
}

export interface IInvoiceRepository {
  // Invoices
  createInvoice(input: CreateInvoiceInput): Promise<InvoiceEntity>;
  updateInvoice(tenantId: string, id: string, input: CreateInvoiceInput): Promise<InvoiceEntity>;
  findInvoiceById(tenantId: string, id: string): Promise<InvoiceEntity | null>;
  findInvoiceByNumber(
    tenantId: string,
    counterpartyId: string,
    invoiceType: InvoiceType,
    invoiceNumber: string,
  ): Promise<InvoiceEntity | null>;
  listInvoices(
    tenantId: string,
    options?: { counterpartyId?: string; type?: InvoiceType; status?: InvoiceStatus },
  ): Promise<InvoiceEntity[]>;
  updateInvoiceStatus(tenantId: string, id: string, status: InvoiceStatus): Promise<InvoiceEntity>;
  updateInvoiceAmountDue(
    tenantId: string,
    id: string,
    amountDueCents: bigint,
  ): Promise<InvoiceEntity>;
  linkJournalEntry(
    tenantId: string,
    invoiceId: string,
    journalEntryId: string,
  ): Promise<InvoiceEntity>;

  // Payments
  createPayment(input: CreatePaymentInput): Promise<PaymentEntity>;
  findPaymentById(tenantId: string, id: string): Promise<PaymentEntity | null>;
  listPayments(tenantId: string, counterpartyId?: string): Promise<PaymentEntity[]>;
  linkPaymentJournalEntry(
    tenantId: string,
    paymentId: string,
    journalEntryId: string,
  ): Promise<PaymentEntity>;
  createAllocation(
    tenantId: string,
    paymentId: string,
    invoiceId: string,
    allocatedAmountCents: bigint,
  ): Promise<PaymentAllocationEntity>;
  listAllocationsForInvoice(
    tenantId: string,
    invoiceId: string,
  ): Promise<PaymentAllocationEntity[]>;
}
