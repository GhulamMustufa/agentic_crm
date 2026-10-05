import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type { CompensationConfigEntity } from '../domain/compensation-config.entity';
import type { EmployeeEntity, EmployeeStatus, PayType } from '../domain/employee.entity';
import type { PayrollDeductionBreakdown, PayrollItemEntity } from '../domain/payroll-item.entity';
import type { PayrollRunEntity, PayrollRunStatus } from '../domain/payroll-run.entity';
import type {
  CreateEmployeeInput,
  CreatePayrollItemInput,
  CreatePayrollRunInput,
  IPayrollRepository,
  SetCompensationConfigInput,
  UpdateEmployeeInput,
} from '../domain/payroll.repository.interface';
import type { CompensationConfig, Employee, PayrollItem, PayrollRun } from '@prisma/client';

@Injectable()
export class PrismaPayrollRepository implements IPayrollRepository {
  private readonly knownTenants = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTenantExists(tenantId: string): Promise<void> {
    if (this.knownTenants.has(tenantId)) {
      return;
    }
    await this.prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        slug: tenantId,
        legalName: `Tenant ${tenantId}`,
      },
    });
    this.knownTenants.add(tenantId);
  }

  // --- Mappers ---
  private toEmployeeEntity(model: Employee): EmployeeEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      firstName: model.firstName,
      lastName: model.lastName,
      email: model.email,
      ssnLast4: model.ssnLast4,
      department: model.department,
      jobTitle: model.jobTitle,
      payType: model.payType as PayType,
      rateCents: model.rateCents,
      status: model.status as EmployeeStatus,
      hireDate: model.hireDate.toISOString().split('T')[0] ?? '',
      terminationDate: model.terminationDate
        ? model.terminationDate.toISOString().split('T')[0]
        : undefined,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toCompensationConfigEntity(model: CompensationConfig): CompensationConfigEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      employeeId: model.employeeId,
      payPeriodsPerYear: model.payPeriodsPerYear,
      taxWithholdingRateBasisPoints: model.taxWithholdingRateBasisPoints,
      standardDeductionCents: model.standardDeductionCents,
      retirementContributionRateBasisPoints: model.retirementContributionRateBasisPoints,
      directDepositAccountLast4: model.directDepositAccountLast4 ?? undefined,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toPayrollRunEntity(model: PayrollRun): PayrollRunEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      accountingPeriodId: model.accountingPeriodId,
      journalEntryId: model.journalEntryId ?? undefined,
      runNumber: model.runNumber,
      payPeriodStart: model.payPeriodStart.toISOString().split('T')[0] ?? '',
      payPeriodEnd: model.payPeriodEnd.toISOString().split('T')[0] ?? '',
      paymentDate: model.paymentDate.toISOString().split('T')[0] ?? '',
      totalGrossCents: model.totalGrossCents,
      totalTaxCents: model.totalTaxCents,
      totalDeductionsCents: model.totalDeductionsCents,
      totalNetCents: model.totalNetCents,
      status: model.status as PayrollRunStatus,
      approvedByUserId: model.approvedByUserId ?? undefined,
      approvedAt: model.approvedAt ?? undefined,
      postedAt: model.postedAt ?? undefined,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toPayrollItemEntity(model: PayrollItem): PayrollItemEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      payrollRunId: model.payrollRunId,
      employeeId: model.employeeId,
      hoursWorked: model.hoursWorked,
      grossPayCents: model.grossPayCents,
      taxWithholdingsCents: model.taxWithholdingsCents,
      deductionsCents: model.deductionsCents,
      netPayCents: model.netPayCents,
      breakdown: model.breakdown as unknown as PayrollDeductionBreakdown,
      createdAt: model.createdAt,
    };
  }

  // --- Employees ---
  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeEntity> {
    await this.ensureTenantExists(input.tenantId);

    const existing = await this.findEmployeeByEmail(input.tenantId, input.email);
    if (existing) {
      throw new ConflictError(`Employee with email '${input.email}' already exists`);
    }

    try {
      const created = await this.prisma.employee.create({
        data: {
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
          hireDate: new Date(input.hireDate),
        },
      });

      return this.toEmployeeEntity(created);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(`Employee with email '${input.email}' already exists`);
      }
      throw err;
    }
  }

  async findEmployeeById(tenantId: string, id: string): Promise<EmployeeEntity | null> {
    const item = await this.prisma.employee.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toEmployeeEntity(item);
  }

  async findEmployeeByEmail(tenantId: string, email: string): Promise<EmployeeEntity | null> {
    const item = await this.prisma.employee.findFirst({
      where: {
        tenantId,
        email: {
          equals: email.trim().toLowerCase(),
          mode: 'insensitive',
        },
      },
    });
    return item ? this.toEmployeeEntity(item) : null;
  }

  async listEmployees(tenantId: string, status?: EmployeeStatus): Promise<EmployeeEntity[]> {
    const items = await this.prisma.employee.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { lastName: 'asc' },
    });
    return items.map((e) => this.toEmployeeEntity(e));
  }

  async updateEmployee(
    tenantId: string,
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeEntity> {
    const existing = await this.findEmployeeById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Employee', id);
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
        ...(input.department !== undefined ? { department: input.department.trim() } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle.trim() } : {}),
        ...(input.payType !== undefined ? { payType: input.payType } : {}),
        ...(input.rateCents !== undefined ? { rateCents: input.rateCents } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.terminationDate !== undefined
          ? { terminationDate: new Date(input.terminationDate) }
          : {}),
        version: { increment: 1 },
      },
    });

    return this.toEmployeeEntity(updated);
  }

  // --- Compensation ---
  async setCompensationConfig(
    input: SetCompensationConfigInput,
  ): Promise<CompensationConfigEntity> {
    await this.ensureTenantExists(input.tenantId);

    const config = await this.prisma.compensationConfig.upsert({
      where: {
        tenantId_employeeId: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
        },
      },
      create: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        payPeriodsPerYear: input.payPeriodsPerYear,
        taxWithholdingRateBasisPoints: input.taxWithholdingRateBasisPoints,
        standardDeductionCents: input.standardDeductionCents,
        retirementContributionRateBasisPoints: input.retirementContributionRateBasisPoints,
        directDepositAccountLast4: input.directDepositAccountLast4,
      },
      update: {
        payPeriodsPerYear: input.payPeriodsPerYear,
        taxWithholdingRateBasisPoints: input.taxWithholdingRateBasisPoints,
        standardDeductionCents: input.standardDeductionCents,
        retirementContributionRateBasisPoints: input.retirementContributionRateBasisPoints,
        directDepositAccountLast4: input.directDepositAccountLast4,
        version: { increment: 1 },
      },
    });

    return this.toCompensationConfigEntity(config);
  }

  async findCompensationConfig(
    tenantId: string,
    employeeId: string,
  ): Promise<CompensationConfigEntity | null> {
    const config = await this.prisma.compensationConfig.findUnique({
      where: {
        tenantId_employeeId: {
          tenantId,
          employeeId,
        },
      },
    });
    return config ? this.toCompensationConfigEntity(config) : null;
  }

  // --- Payroll Runs ---
  async createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRunEntity> {
    await this.ensureTenantExists(input.tenantId);

    const created = await this.prisma.payrollRun.create({
      data: {
        tenantId: input.tenantId,
        accountingPeriodId: input.accountingPeriodId,
        runNumber: input.runNumber,
        payPeriodStart: new Date(input.payPeriodStart),
        payPeriodEnd: new Date(input.payPeriodEnd),
        paymentDate: new Date(input.paymentDate),
        totalGrossCents: input.totalGrossCents,
        totalTaxCents: input.totalTaxCents,
        totalDeductionsCents: input.totalDeductionsCents,
        totalNetCents: input.totalNetCents,
        status: input.status,
      },
    });

    return this.toPayrollRunEntity(created);
  }

  async findPayrollRunById(tenantId: string, id: string): Promise<PayrollRunEntity | null> {
    const item = await this.prisma.payrollRun.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toPayrollRunEntity(item);
  }

  async findPayrollRunByPeriod(
    tenantId: string,
    payPeriodStart: string,
    payPeriodEnd: string,
  ): Promise<PayrollRunEntity | null> {
    const item = await this.prisma.payrollRun.findFirst({
      where: {
        tenantId,
        payPeriodStart: new Date(payPeriodStart),
        payPeriodEnd: new Date(payPeriodEnd),
        status: { not: 'CANCELLED' },
      },
    });
    return item ? this.toPayrollRunEntity(item) : null;
  }

  async listPayrollRuns(tenantId: string, status?: PayrollRunStatus): Promise<PayrollRunEntity[]> {
    const items = await this.prisma.payrollRun.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { payPeriodStart: 'desc' },
    });
    return items.map((r) => this.toPayrollRunEntity(r));
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
    const existing = await this.findPayrollRunById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Payroll Run', id);
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status,
        ...(metadata?.approvedByUserId !== undefined
          ? { approvedByUserId: metadata.approvedByUserId }
          : {}),
        ...(metadata?.approvedAt !== undefined ? { approvedAt: metadata.approvedAt } : {}),
        ...(metadata?.journalEntryId !== undefined
          ? { journalEntryId: metadata.journalEntryId }
          : {}),
        ...(metadata?.postedAt !== undefined ? { postedAt: metadata.postedAt } : {}),
        version: { increment: 1 },
      },
    });

    return this.toPayrollRunEntity(updated);
  }

  // --- Payroll Items ---
  async createPayrollItems(items: CreatePayrollItemInput[]): Promise<PayrollItemEntity[]> {
    if (items.length === 0) {
      return [];
    }

    const first = items[0];
    if (first) {
      await this.ensureTenantExists(first.tenantId);
    }

    const createdItems: PayrollItemEntity[] = [];
    for (const item of items) {
      const created = await this.prisma.payrollItem.create({
        data: {
          tenantId: item.tenantId,
          payrollRunId: item.payrollRunId,
          employeeId: item.employeeId,
          hoursWorked: item.hoursWorked,
          grossPayCents: item.grossPayCents,
          taxWithholdingsCents: item.taxWithholdingsCents,
          deductionsCents: item.deductionsCents,
          netPayCents: item.netPayCents,
          breakdown: item.breakdown as unknown as Prisma.InputJsonValue,
        },
      });
      createdItems.push(this.toPayrollItemEntity(created));
    }

    return createdItems;
  }

  async listPayrollItems(tenantId: string, payrollRunId: string): Promise<PayrollItemEntity[]> {
    const items = await this.prisma.payrollItem.findMany({
      where: {
        tenantId,
        payrollRunId,
      },
    });
    return items.map((i) => this.toPayrollItemEntity(i));
  }

  async findPayrollItem(
    tenantId: string,
    payrollRunId: string,
    employeeId: string,
  ): Promise<PayrollItemEntity | null> {
    const item = await this.prisma.payrollItem.findUnique({
      where: {
        payrollRunId_employeeId: {
          payrollRunId,
          employeeId,
        },
      },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toPayrollItemEntity(item);
  }
}
