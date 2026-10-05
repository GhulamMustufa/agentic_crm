import { z } from 'zod';

export const createAccountSchema = z.object({
  accountCode: z.string().min(2).max(50),
  name: z.string().min(2).max(150),
  classification: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  subClassification: z.string().max(50).optional(),
  parentAccountId: z.string().uuid().optional(),
});

export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const createFiscalYearSchema = z.object({
  yearLabel: z.string().min(4).max(20),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

export type CreateFiscalYearDto = z.infer<typeof createFiscalYearSchema>;

export const createPeriodSchema = z.object({
  fiscalYearId: z.string().uuid(),
  periodNumber: z.number().int().min(1).max(13),
  periodName: z.string().min(2).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

export type CreatePeriodDto = z.infer<typeof createPeriodSchema>;

const journalLineInputSchema = z
  .object({
    accountId: z.string().uuid(),
    debitCents: z
      .union([z.bigint(), z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
      .transform((v) => BigInt(v)),
    creditCents: z
      .union([z.bigint(), z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
      .transform((v) => BigInt(v)),
    memo: z.string().max(255).optional(),
  })
  .refine(
    (line) =>
      (line.debitCents > 0n && line.creditCents === 0n) ||
      (line.creditCents > 0n && line.debitCents === 0n),
    {
      message:
        'Each journal line must specify either a positive debit or positive credit, not both.',
    },
  );

export const createJournalEntrySchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    description: z.string().min(3).max(500),
    sourceType: z
      .enum(['MANUAL', 'INVOICE', 'BILL', 'PAYMENT', 'PAYROLL', 'BANK_RECONCILIATION'])
      .default('MANUAL'),
    sourceId: z.string().uuid().optional(),
    lines: z.array(journalLineInputSchema).min(2, 'Journal entry requires at least 2 lines'),
  })
  .refine(
    (entry) => {
      const totalDebits = entry.lines.reduce((sum, l) => sum + l.debitCents, 0n);
      const totalCredits = entry.lines.reduce((sum, l) => sum + l.creditCents, 0n);
      return totalDebits === totalCredits && totalDebits > 0n;
    },
    {
      message:
        'Double-entry invariant violated: Total debits must equal total credits and be greater than zero.',
    },
  );

export type CreateJournalEntryDto = z.infer<typeof createJournalEntrySchema>;

export const reverseJournalEntrySchema = z.object({
  reason: z.string().min(5).max(500),
  reversalDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional(),
});

export type ReverseJournalEntryDto = z.infer<typeof reverseJournalEntrySchema>;
