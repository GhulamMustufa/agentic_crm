import { z } from 'zod';

const invoiceLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().min(2).max(255),
  quantity: z.number().positive().default(1),
  unitCostCents: z
    .union([z.bigint(), z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v)),
});

export const createInvoiceSchema = z.object({
  counterpartyId: z.string().uuid(),
  invoiceType: z.enum(['BILL', 'INVOICE']),
  invoiceNumber: z.string().min(1).max(100),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  currency: z.string().length(3).default('USD'),
  taxCents: z
    .union([z.bigint(), z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
    .default(0)
    .transform((v) => BigInt(v)),
  lines: z.array(invoiceLineInputSchema).min(1, 'Invoice must have at least one line item'),
});

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = createInvoiceSchema;
export type UpdateInvoiceInput = z.input<typeof updateInvoiceSchema>;
export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>;

const paymentAllocationInputSchema = z.object({
  invoiceId: z.string().uuid(),
  allocatedAmountCents: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v)),
});

export const recordPaymentSchema = z.object({
  counterpartyId: z.string().uuid(),
  paymentAccountId: z.string().uuid(), // Cash / Bank Account in Chart of Accounts
  paymentType: z.enum(['DISBURSEMENT', 'RECEIPT']),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  amountCents: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v)),
  paymentMethod: z.enum(['ACH', 'WIRE', 'CHECK', 'CREDIT_CARD', 'CASH']),
  referenceNumber: z.string().max(100).optional(),
  allocations: z.array(paymentAllocationInputSchema).optional(),
});

export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().min(5).max(500),
});

export type VoidInvoiceInput = z.input<typeof voidInvoiceSchema>;
export type VoidInvoiceDto = z.infer<typeof voidInvoiceSchema>;
