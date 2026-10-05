import { z } from 'zod';

export const createTenantSchema = z.object({
  legalName: z.string().min(2, 'Organization name must be at least 2 characters').max(255),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens'),
  baseCurrency: z.string().length(3).default('USD'),
  timezone: z.string().default('UTC'),
});

export type CreateTenantDto = z.infer<typeof createTenantSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email('Valid email required'),
  roleCode: z.enum(['OWNER', 'CONTROLLER', 'BOOKKEEPER', 'AUDITOR']).default('BOOKKEEPER'),
});

export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;

export const updateTenantSettingsSchema = z.object({
  autoPostMinConfidence: z.number().min(0.5).max(1.0).optional(),
  maxAutoPostAmountCents: z
    .bigint()
    .or(z.number().transform((n) => BigInt(n)))
    .optional(),
  allowAiAutoPosting: z.boolean().optional(),
  requireReceiptAboveCents: z
    .bigint()
    .or(z.number().transform((n) => BigInt(n)))
    .optional(),
});

export type UpdateTenantSettingsDto = z.infer<typeof updateTenantSettingsSchema>;
