import { z } from 'zod';

export const createBankAccountSchema = z.object({
  ledgerAccountId: z.string().uuid(),
  accountName: z.string().min(2).max(150),
  institutionName: z.string().min(2).max(150),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD']),
  currency: z.string().length(3).default('USD'),
  accountNumberLast4: z.string().regex(/^\d{4}$/, 'Must be 4 digits'),
});

export type CreateBankAccountInput = z.input<typeof createBankAccountSchema>;
export type CreateBankAccountDto = z.infer<typeof createBankAccountSchema>;

export const uploadStatementSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['text/csv', 'application/pdf', 'application/x-pdf']),
  content: z.string().min(10, 'Statement content is required'), // Raw CSV string or Base64 PDF
  manualBankName: z.string().min(2).optional(),
  manualAccountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD']).optional(),
  manualAccountNumberLast4: z
    .string()
    .regex(/^\d{4}$/, 'Must be 4 digits')
    .optional(),
});

export type UploadStatementInput = z.input<typeof uploadStatementSchema>;
export type UploadStatementDto = z.infer<typeof uploadStatementSchema>;

export const presignedUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['text/csv', 'application/pdf', 'application/x-pdf']),
});

export type PresignedUrlInput = z.input<typeof presignedUrlSchema>;
export type PresignedUrlDto = z.infer<typeof presignedUrlSchema>;

export const queueStatementUploadSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['text/csv', 'application/pdf', 'application/x-pdf']),
  objectKey: z.string().min(5),
  manualBankName: z.string().min(2).optional(),
  manualAccountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD']).optional(),
  manualAccountNumberLast4: z
    .string()
    .regex(/^\d{4}$/, 'Must be 4 digits')
    .optional(),
});

export type QueueStatementUploadInput = z.input<typeof queueStatementUploadSchema>;
export type QueueStatementUploadDto = z.infer<typeof queueStatementUploadSchema>;

export const correctProposalSchema = z.object({
  debitAccountId: z.string().uuid().optional(),
  creditAccountId: z.string().uuid().optional(),
  notes: z.string().min(3).max(500),
});

export type CorrectProposalInput = z.input<typeof correctProposalSchema>;
export type CorrectProposalDto = z.infer<typeof correctProposalSchema>;

export const rejectProposalSchema = z.object({
  reason: z.string().min(5).max(500),
});

export type RejectProposalInput = z.input<typeof rejectProposalSchema>;
export type RejectProposalDto = z.infer<typeof rejectProposalSchema>;

export const resolveExceptionSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  resolutionNotes: z.string().min(1).max(500).optional().default('Resolved by supervisor'),
});

export type ResolveExceptionInput = z.input<typeof resolveExceptionSchema>;
export type ResolveExceptionDto = z.infer<typeof resolveExceptionSchema>;
