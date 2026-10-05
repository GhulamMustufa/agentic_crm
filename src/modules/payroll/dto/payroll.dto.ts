import { z } from 'zod';

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  ssnLast4: z.string().regex(/^\d{4}$/, 'Must be 4 digits'),
  department: z.string().max(100).default('General'),
  jobTitle: z.string().min(1).max(100),
  payType: z.enum(['SALARY', 'HOURLY']),
  rateCents: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v)),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

export type CreateEmployeeInputDto = z.input<typeof createEmployeeSchema>;
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional(),
  jobTitle: z.string().min(1).max(100).optional(),
  payType: z.enum(['SALARY', 'HOURLY']).optional(),
  rateCents: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v))
    .optional(),
  status: z.enum(['ACTIVE', 'TERMINATED', 'LEAVE']).optional(),
  terminationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional(),
});

export type UpdateEmployeeInputDto = z.input<typeof updateEmployeeSchema>;
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;

export const setCompensationConfigSchema = z.object({
  payPeriodsPerYear: z
    .union([z.literal(12), z.literal(24), z.literal(26), z.literal(52)])
    .default(24),
  taxWithholdingRateBasisPoints: z.number().int().min(0).max(10000).default(1500), // 15%
  standardDeductionCents: z
    .union([z.bigint(), z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
    .default(0)
    .transform((v) => BigInt(v)),
  retirementContributionRateBasisPoints: z.number().int().min(0).max(10000).default(0),
  directDepositAccountLast4: z
    .string()
    .regex(/^\d{4}$/, 'Must be 4 digits')
    .optional(),
});

export type SetCompensationConfigInputDto = z.input<typeof setCompensationConfigSchema>;
export type SetCompensationConfigDto = z.infer<typeof setCompensationConfigSchema>;

export const createPayrollRunSchema = z.object({
  payPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  payPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  employeeHours: z
    .array(
      z.object({
        employeeId: z.string().uuid(),
        hoursWorked: z.number().nonnegative(),
      }),
    )
    .optional(),
});

export type CreatePayrollRunInputDto = z.input<typeof createPayrollRunSchema>;
export type CreatePayrollRunDto = z.infer<typeof createPayrollRunSchema>;
