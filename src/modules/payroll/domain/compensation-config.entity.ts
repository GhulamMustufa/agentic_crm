export interface CompensationConfigEntity {
  id: string;
  tenantId: string;
  employeeId: string;
  payPeriodsPerYear: number; // 12, 24, 26, 52
  taxWithholdingRateBasisPoints: number; // e.g. 1500 = 15.00%
  standardDeductionCents: bigint; // fixed deduction per period (health, benefits)
  retirementContributionRateBasisPoints: number; // e.g. 500 = 5.00%
  directDepositAccountLast4?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
