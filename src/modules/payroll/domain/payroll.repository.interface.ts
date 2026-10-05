import type { CompensationConfigEntity } from './compensation-config.entity';
import type { EmployeeEntity, EmployeeStatus, PayType } from './employee.entity';
import type { PayrollItemEntity } from './payroll-item.entity';
import type { PayrollRunEntity, PayrollRunStatus } from './payroll-run.entity';

export const PAYROLL_REPOSITORY_TOKEN = Symbol('IPayrollRepository');

export interface CreateEmployeeInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  ssnLast4: string;
  department?: string;
  jobTitle: string;
  payType: PayType;
  rateCents: bigint;
  hireDate: string;
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  department?: string;
  jobTitle?: string;
  payType?: PayType;
  rateCents?: bigint;
  status?: EmployeeStatus;
  terminationDate?: string;
}

export interface SetCompensationConfigInput {
  tenantId: string;
  employeeId: string;
  payPeriodsPerYear: number;
  taxWithholdingRateBasisPoints: number;
  standardDeductionCents: bigint;
  retirementContributionRateBasisPoints: number;
  directDepositAccountLast4?: string;
}

export interface CreatePayrollRunInput {
  tenantId: string;
  accountingPeriodId: string;
  runNumber: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  paymentDate: string;
  totalGrossCents: bigint;
  totalTaxCents: bigint;
  totalDeductionsCents: bigint;
  totalNetCents: bigint;
  status: PayrollRunStatus;
}

export interface CreatePayrollItemInput {
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  hoursWorked: number;
  grossPayCents: bigint;
  taxWithholdingsCents: bigint;
  deductionsCents: bigint;
  netPayCents: bigint;
  breakdown: {
    standardDeductionCents: string;
    retirementContributionCents: string;
    otherDeductionsCents: string;
  };
}

export interface IPayrollRepository {
  // Employees
  createEmployee(input: CreateEmployeeInput): Promise<EmployeeEntity>;
  findEmployeeById(tenantId: string, id: string): Promise<EmployeeEntity | null>;
  findEmployeeByEmail(tenantId: string, email: string): Promise<EmployeeEntity | null>;
  listEmployees(tenantId: string, status?: EmployeeStatus): Promise<EmployeeEntity[]>;
  updateEmployee(tenantId: string, id: string, input: UpdateEmployeeInput): Promise<EmployeeEntity>;

  // Compensation
  setCompensationConfig(input: SetCompensationConfigInput): Promise<CompensationConfigEntity>;
  findCompensationConfig(
    tenantId: string,
    employeeId: string,
  ): Promise<CompensationConfigEntity | null>;

  // Payroll Runs
  createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRunEntity>;
  findPayrollRunById(tenantId: string, id: string): Promise<PayrollRunEntity | null>;
  findPayrollRunByPeriod(
    tenantId: string,
    payPeriodStart: string,
    payPeriodEnd: string,
  ): Promise<PayrollRunEntity | null>;
  listPayrollRuns(tenantId: string, status?: PayrollRunStatus): Promise<PayrollRunEntity[]>;
  updatePayrollRunStatus(
    tenantId: string,
    id: string,
    status: PayrollRunStatus,
    metadata?: {
      approvedByUserId?: string;
      approvedAt?: Date;
      journalEntryId?: string;
      postedAt?: Date;
    },
  ): Promise<PayrollRunEntity>;

  // Payroll Items (Payslips)
  createPayrollItems(items: CreatePayrollItemInput[]): Promise<PayrollItemEntity[]>;
  listPayrollItems(tenantId: string, payrollRunId: string): Promise<PayrollItemEntity[]>;
  findPayrollItem(
    tenantId: string,
    payrollRunId: string,
    employeeId: string,
  ): Promise<PayrollItemEntity | null>;
}
