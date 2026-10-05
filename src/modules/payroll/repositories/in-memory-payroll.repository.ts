import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';

import type { CompensationConfigEntity } from '../domain/compensation-config.entity';
import type { EmployeeEntity, EmployeeStatus } from '../domain/employee.entity';
import type { PayrollItemEntity } from '../domain/payroll-item.entity';
import type { PayrollRunEntity, PayrollRunStatus } from '../domain/payroll-run.entity';
import type {
  IPayrollRepository,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  SetCompensationConfigInput,
  CreatePayrollRunInput,
  CreatePayrollItemInput,
} from '../domain/payroll.repository.interface';

@Injectable()
export class InMemoryPayrollRepository implements IPayrollRepository {
  private readonly employees = new Map<string, EmployeeEntity>();
  private readonly compensationConfigs = new Map<string, CompensationConfigEntity>();
  private readonly payrollRuns = new Map<string, PayrollRunEntity>();
  private readonly payrollItems = new Map<string, PayrollItemEntity>();

  // Employees
  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeEntity> {
    const existing = await this.findEmployeeByEmail(input.tenantId, input.email);
    if (existing) {
      throw new ConflictError(`Employee with email '${input.email}' already exists`);
    }

    const now = new Date();
    const employee: EmployeeEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      ssnLast4: input.ssnLast4,
      department: input.department?.trim() || 'General',
      jobTitle: input.jobTitle.trim(),
      payType: input.payType,
      rateCents: input.rateCents,
      status: 'ACTIVE',
      hireDate: input.hireDate,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.employees.set(employee.id, { ...employee });
    return { ...employee };
  }

  async findEmployeeById(tenantId: string, id: string): Promise<EmployeeEntity | null> {
    const employee = this.employees.get(id);
    if (!employee || employee.tenantId !== tenantId) {
      return null;
    }
    return { ...employee };
  }

  async findEmployeeByEmail(tenantId: string, email: string): Promise<EmployeeEntity | null> {
    const normalized = email.trim().toLowerCase();
    for (const employee of this.employees.values()) {
      if (employee.tenantId === tenantId && employee.email.toLowerCase() === normalized) {
        return { ...employee };
      }
    }
    return null;
  }

  async listEmployees(tenantId: string, status?: EmployeeStatus): Promise<EmployeeEntity[]> {
    return Array.from(this.employees.values())
      .filter((e) => e.tenantId === tenantId && (!status || e.status === status))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .map((e) => ({ ...e }));
  }

  async updateEmployee(
    tenantId: string,
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeEntity> {
    const employee = await this.findEmployeeById(tenantId, id);
    if (!employee) {
      throw new NotFoundError('Employee', id);
    }

    const updated: EmployeeEntity = {
      ...employee,
      ...input,
      firstName: input.firstName !== undefined ? input.firstName.trim() : employee.firstName,
      lastName: input.lastName !== undefined ? input.lastName.trim() : employee.lastName,
      department: input.department !== undefined ? input.department.trim() : employee.department,
      jobTitle: input.jobTitle !== undefined ? input.jobTitle.trim() : employee.jobTitle,
      updatedAt: new Date(),
      version: employee.version + 1,
    };

    this.employees.set(id, { ...updated });
    return { ...updated };
  }

  // Compensation
  async setCompensationConfig(
    input: SetCompensationConfigInput,
  ): Promise<CompensationConfigEntity> {
    const existing = await this.findCompensationConfig(input.tenantId, input.employeeId);
    const now = new Date();

    const config: CompensationConfigEntity = {
      id: existing ? existing.id : uuidv4(),
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      payPeriodsPerYear: input.payPeriodsPerYear,
      taxWithholdingRateBasisPoints: input.taxWithholdingRateBasisPoints,
      standardDeductionCents: input.standardDeductionCents,
      retirementContributionRateBasisPoints: input.retirementContributionRateBasisPoints,
      directDepositAccountLast4: input.directDepositAccountLast4,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      version: existing ? existing.version + 1 : 1,
    };

    this.compensationConfigs.set(`${input.tenantId}:${input.employeeId}`, { ...config });
    return { ...config };
  }

  async findCompensationConfig(
    tenantId: string,
    employeeId: string,
  ): Promise<CompensationConfigEntity | null> {
    const config = this.compensationConfigs.get(`${tenantId}:${employeeId}`);
    return config ? { ...config } : null;
  }

  // Payroll Runs
  async createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRunEntity> {
    const runId = uuidv4();
    const now = new Date();

    const run: PayrollRunEntity = {
      id: runId,
      tenantId: input.tenantId,
      accountingPeriodId: input.accountingPeriodId,
      runNumber: input.runNumber,
      payPeriodStart: input.payPeriodStart,
      payPeriodEnd: input.payPeriodEnd,
      paymentDate: input.paymentDate,
      totalGrossCents: input.totalGrossCents,
      totalTaxCents: input.totalTaxCents,
      totalDeductionsCents: input.totalDeductionsCents,
      totalNetCents: input.totalNetCents,
      status: input.status,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.payrollRuns.set(runId, { ...run });
    return { ...run };
  }

  async findPayrollRunById(tenantId: string, id: string): Promise<PayrollRunEntity | null> {
    const run = this.payrollRuns.get(id);
    if (!run || run.tenantId !== tenantId) {
      return null;
    }
    return { ...run };
  }

  async findPayrollRunByPeriod(
    tenantId: string,
    payPeriodStart: string,
    payPeriodEnd: string,
  ): Promise<PayrollRunEntity | null> {
    for (const run of this.payrollRuns.values()) {
      if (
        run.tenantId === tenantId &&
        run.payPeriodStart === payPeriodStart &&
        run.payPeriodEnd === payPeriodEnd &&
        run.status !== 'CANCELLED'
      ) {
        return { ...run };
      }
    }
    return null;
  }

  async listPayrollRuns(tenantId: string, status?: PayrollRunStatus): Promise<PayrollRunEntity[]> {
    return Array.from(this.payrollRuns.values())
      .filter((r) => r.tenantId === tenantId && (!status || r.status === status))
      .sort((a, b) => b.payPeriodStart.localeCompare(a.payPeriodStart))
      .map((r) => ({ ...r }));
  }

  async updatePayrollRunStatus(
    tenantId: string,
    id: string,
    status: PayrollRunStatus,
    metadata?: {
      approvedByUserId?: string;
      approvedAt?: Date;
      journalEntryId?: string;
      postedAt?: Date;
    },
  ): Promise<PayrollRunEntity> {
    const run = await this.findPayrollRunById(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll Run', id);
    }

    const updated: PayrollRunEntity = {
      ...run,
      status,
      approvedByUserId: metadata?.approvedByUserId ?? run.approvedByUserId,
      approvedAt: metadata?.approvedAt ?? run.approvedAt,
      journalEntryId: metadata?.journalEntryId ?? run.journalEntryId,
      postedAt: metadata?.postedAt ?? run.postedAt,
      updatedAt: new Date(),
      version: run.version + 1,
    };

    this.payrollRuns.set(id, { ...updated });
    return { ...updated };
  }

  // Payroll Items
  async createPayrollItems(items: CreatePayrollItemInput[]): Promise<PayrollItemEntity[]> {
    const now = new Date();
    const created: PayrollItemEntity[] = [];

    for (const item of items) {
      const entity: PayrollItemEntity = {
        id: uuidv4(),
        tenantId: item.tenantId,
        payrollRunId: item.payrollRunId,
        employeeId: item.employeeId,
        hoursWorked: item.hoursWorked,
        grossPayCents: item.grossPayCents,
        taxWithholdingsCents: item.taxWithholdingsCents,
        deductionsCents: item.deductionsCents,
        netPayCents: item.netPayCents,
        breakdown: item.breakdown,
        createdAt: now,
      };

      this.payrollItems.set(entity.id, { ...entity });
      created.push({ ...entity });
    }

    return created;
  }

  async listPayrollItems(tenantId: string, payrollRunId: string): Promise<PayrollItemEntity[]> {
    return Array.from(this.payrollItems.values())
      .filter((i) => i.tenantId === tenantId && i.payrollRunId === payrollRunId)
      .map((i) => ({ ...i }));
  }

  async findPayrollItem(
    tenantId: string,
    payrollRunId: string,
    employeeId: string,
  ): Promise<PayrollItemEntity | null> {
    for (const item of this.payrollItems.values()) {
      if (
        item.tenantId === tenantId &&
        item.payrollRunId === payrollRunId &&
        item.employeeId === employeeId
      ) {
        return { ...item };
      }
    }
    return null;
  }
}
