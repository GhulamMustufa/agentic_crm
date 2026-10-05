export interface PayrollDeductionBreakdown {
  standardDeductionCents: string;
  retirementContributionCents: string;
  otherDeductionsCents: string;
}

export interface PayrollItemEntity {
  id: string;
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  hoursWorked: number;
  grossPayCents: bigint;
  taxWithholdingsCents: bigint;
  deductionsCents: bigint;
  netPayCents: bigint;
  breakdown: PayrollDeductionBreakdown;
  createdAt: Date;
}
