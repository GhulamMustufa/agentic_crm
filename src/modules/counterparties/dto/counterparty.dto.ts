import { z } from 'zod';

export const createCounterpartySchema = z.object({
  type: z.enum(['VENDOR', 'CUSTOMER', 'BOTH']),
  legalName: z.string().min(2).max(255),
  taxIdentifier: z.string().max(100).optional(),
  defaultAccountId: z.string().uuid().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
});

export type CreateCounterpartyInput = z.input<typeof createCounterpartySchema>;
export type CreateCounterpartyDto = z.infer<typeof createCounterpartySchema>;

export const updateCounterpartySchema = z.object({
  legalName: z.string().min(2).max(255).optional(),
  taxIdentifier: z.string().max(100).optional(),
  defaultAccountId: z.string().uuid().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCounterpartyInput = z.input<typeof updateCounterpartySchema>;
export type UpdateCounterpartyDto = z.infer<typeof updateCounterpartySchema>;
