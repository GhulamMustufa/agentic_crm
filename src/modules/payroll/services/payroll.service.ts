import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '../../../core/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import {
  PAYROLL_REPOSITORY_TOKEN,
  type IPayrollRepository,
  type CreatePayrollItemInput,
} from '../domain/payroll.repository.interface';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  setCompensationConfigSchema,
  createPayrollRunSchema,
  type CreateEmployeeInputDto,
  type UpdateEmployeeInputDto,
  type SetCompensationConfigInputDto,
  type CreatePayrollRunInputDto,
} from '../dto/payroll.dto';

import type { CompensationConfigEntity } from '../domain/compensation-config.entity';
import type { EmployeeEntity, EmployeeStatus } from '../domain/employee.entity';
import type { PayrollItemEntity } from '../domain/payroll-item.entity';
import type { PayrollRunEntity, PayrollRunStatus } from '../domain/payroll-run.entity';

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PAYROLL_REPOSITORY_TOKEN)
    private readonly payrollRepo: IPayrollRepository,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  async createEmployee(
    tenantId: string,
    userId: string,
    rawDto: CreateEmployeeInputDto,
  ): Promise<EmployeeEntity> {
    const parseResult = createEmployeeSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Employee validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const existing = await this.payrollRepo.findEmployeeByEmail(tenantId, dto.email);
    if (existing) {
      throw new ConflictError(`Employee with email '${dto.email}' already exists`);
    }

    const employee = await this.payrollRepo.createEmployee({
      tenantId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      ssnLast4: dto.ssnLast4,
      department: dto.department,
      jobTitle: dto.jobTitle,
      payType: dto.payType,
      rateCents: dto.rateCents,
      hireDate: dto.hireDate,
    });

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'Employee',
      entityId: employee.id,
      action: 'PAYROLL_EMPLOYEE_CREATED',
      newState: { employeeId: employee.id, email: employee.email, payType: employee.payType },
    });

    return employee;
  }

  async updateEmployee(
    tenantId: string,
    userId: string,
    employeeId: string,
    rawDto: UpdateEmployeeInputDto,
  ): Promise<EmployeeEntity> {
    const parseResult = updateEmployeeSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Employee update validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const employee = await this.payrollRepo.findEmployeeById(tenantId, employeeId);
    if (!employee) {
      throw new NotFoundError('Employee', employeeId);
    }

    const updated = await this.payrollRepo.updateEmployee(tenantId, employeeId, dto);

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'Employee',
      entityId: employeeId,
      action: 'PAYROLL_EMPLOYEE_UPDATED',
      newState: { employeeId, updates: dto },
    });

    return updated;
  }

  async getEmployeeById(tenantId: string, employeeId: string): Promise<EmployeeEntity> {
    const employee = await this.payrollRepo.findEmployeeById(tenantId, employeeId);
    if (!employee) {
      throw new NotFoundError('Employee', employeeId);
    }
    return employee;
  }

  async listEmployees(tenantId: string, status?: EmployeeStatus): Promise<EmployeeEntity[]> {
    return this.payrollRepo.listEmployees(tenantId, status);
  }

  // ---------------------------------------------------------------------------
  // Compensation Configuration
  // ---------------------------------------------------------------------------

  async setCompensationConfig(
    tenantId: string,
    userId: string,
    employeeId: string,
    rawDto: SetCompensationConfigInputDto,
  ): Promise<CompensationConfigEntity> {
    const parseResult = setCompensationConfigSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Compensation configuration validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const employee = await this.payrollRepo.findEmployeeById(tenantId, employeeId);
    if (!employee) {
      throw new NotFoundError('Employee', employeeId);
    }

    const config = await this.payrollRepo.setCompensationConfig({
      tenantId,
      employeeId,
      payPeriodsPerYear: dto.payPeriodsPerYear,
      taxWithholdingRateBasisPoints: dto.taxWithholdingRateBasisPoints,
      standardDeductionCents: dto.standardDeductionCents,
      retirementContributionRateBasisPoints: dto.retirementContributionRateBasisPoints,
      directDepositAccountLast4: dto.directDepositAccountLast4,
    });

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'CompensationConfig',
      entityId: config.id,
      action: 'PAYROLL_COMPENSATION_CONFIGURED',
      newState: { employeeId, configId: config.id },
    });

    return config;
  }

  async getCompensationConfig(
    tenantId: string,
    employeeId: string,
  ): Promise<CompensationConfigEntity | null> {
    const employee = await this.payrollRepo.findEmployeeById(tenantId, employeeId);
    if (!employee) {
      throw new NotFoundError('Employee', employeeId);
    }
    return this.payrollRepo.findCompensationConfig(tenantId, employeeId);
  }

  // ---------------------------------------------------------------------------
  // Payroll Runs & Calculations
  // ---------------------------------------------------------------------------

  async createPayrollRun(
    tenantId: string,
    userId: string,
    rawDto: CreatePayrollRunInputDto,
  ): Promise<{ run: PayrollRunEntity; items: PayrollItemEntity[] }> {
    const parseResult = createPayrollRunSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Payroll run validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    if (dto.payPeriodStart > dto.payPeriodEnd) {
      throw new ValidationError('payPeriodStart cannot be after payPeriodEnd');
    }

    // Check duplicate run
    const existingRun = await this.payrollRepo.findPayrollRunByPeriod(
      tenantId,
      dto.payPeriodStart,
      dto.payPeriodEnd,
    );
    if (existingRun) {
      throw new ConflictError(
        `Active payroll run already exists for period ${dto.payPeriodStart} to ${dto.payPeriodEnd}`,
      );
    }

    // Validate accounting period covers the payment date
    const accountingPeriod = await this.ledgerService.getPeriodByDate(tenantId, dto.paymentDate);
    if (!accountingPeriod) {
      throw new NotFoundError(
        'Accounting Period',
        `No accounting period found for payment date '${dto.paymentDate}'`,
      );
    }

    // Get active employees
    const activeEmployees = await this.payrollRepo.listEmployees(tenantId, 'ACTIVE');
    if (activeEmployees.length === 0) {
      throw new UnprocessableEntityError('No active employees found for payroll calculation');
    }

    const runNumber = `PR-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const tempRunId = uuidv4();

    const itemsToCreate: CreatePayrollItemInput[] = [];
    let runTotalGross = 0n;
    let runTotalTax = 0n;
    let runTotalDeductions = 0n;
    let runTotalNet = 0n;

    for (const employee of activeEmployees) {
      const config = (await this.payrollRepo.findCompensationConfig(tenantId, employee.id)) || {
        payPeriodsPerYear: 24,
        taxWithholdingRateBasisPoints: 1500, // 15%
        standardDeductionCents: 0n,
        retirementContributionRateBasisPoints: 0,
      };

      let grossPayCents = 0n;
      let hoursWorked = 0;

      if (employee.payType === 'SALARY') {
        const periods = BigInt(config.payPeriodsPerYear);
        grossPayCents = employee.rateCents / periods;
        hoursWorked = 80;
      } else {
        const matchingHours = dto.employeeHours?.find((h) => h.employeeId === employee.id);
        hoursWorked = matchingHours ? matchingHours.hoursWorked : 0;
        const hoursScaled = BigInt(Math.round(hoursWorked * 100));
        grossPayCents = (employee.rateCents * hoursScaled) / 100n;
      }

      // Deterministic Tax Withholding
      const taxWithholdingsCents =
        (grossPayCents * BigInt(config.taxWithholdingRateBasisPoints)) / 10000n;

      // Deterministic Deductions
      const retirementCents =
        (grossPayCents * BigInt(config.retirementContributionRateBasisPoints)) / 10000n;
      const standardDeductionCents = config.standardDeductionCents;
      let deductionsCents = retirementCents + standardDeductionCents;

      // Invariant Protection: Ensure total deductions + taxes do not exceed gross pay
      if (taxWithholdingsCents + deductionsCents > grossPayCents) {
        if (taxWithholdingsCents >= grossPayCents) {
          deductionsCents = 0n;
        } else {
          deductionsCents = grossPayCents - taxWithholdingsCents;
        }
      }

      const netPayCents = grossPayCents - taxWithholdingsCents - deductionsCents;

      // Invariant check: gross === net + tax + deductions
      if (grossPayCents !== netPayCents + taxWithholdingsCents + deductionsCents) {
        throw new UnprocessableEntityError(
          `Calculation invariant failed for employee ${employee.id}`,
        );
      }

      runTotalGross += grossPayCents;
      runTotalTax += taxWithholdingsCents;
      runTotalDeductions += deductionsCents;
      runTotalNet += netPayCents;

      itemsToCreate.push({
        tenantId,
        payrollRunId: tempRunId,
        employeeId: employee.id,
        hoursWorked,
        grossPayCents,
        taxWithholdingsCents,
        deductionsCents,
        netPayCents,
        breakdown: {
          standardDeductionCents: standardDeductionCents.toString(),
          retirementContributionCents: retirementCents.toString(),
          otherDeductionsCents: '0',
        },
      });
    }

    const run = await this.payrollRepo.createPayrollRun({
      tenantId,
      accountingPeriodId: accountingPeriod.id,
      runNumber,
      payPeriodStart: dto.payPeriodStart,
      payPeriodEnd: dto.payPeriodEnd,
      paymentDate: dto.paymentDate,
      totalGrossCents: runTotalGross,
      totalTaxCents: runTotalTax,
      totalDeductionsCents: runTotalDeductions,
      totalNetCents: runTotalNet,
      status: 'DRAFT',
    });

    // Update items to actual run id
    const items = await this.payrollRepo.createPayrollItems(
      itemsToCreate.map((item) => ({ ...item, payrollRunId: run.id })),
    );

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'PayrollRun',
      entityId: run.id,
      action: 'PAYROLL_RUN_CREATED',
      newState: {
        runId: run.id,
        runNumber: run.runNumber,
        totalGrossCents: run.totalGrossCents.toString(),
        totalNetCents: run.totalNetCents.toString(),
      },
    });

    return { run, items };
  }

  async getPayrollRunById(
    tenantId: string,
    runId: string,
  ): Promise<{ run: PayrollRunEntity; items: PayrollItemEntity[] }> {
    const run = await this.payrollRepo.findPayrollRunById(tenantId, runId);
    if (!run) {
      throw new NotFoundError('Payroll Run', runId);
    }
    const items = await this.payrollRepo.listPayrollItems(tenantId, runId);
    return { run, items };
  }

  async listPayrollRuns(tenantId: string, status?: PayrollRunStatus): Promise<PayrollRunEntity[]> {
    return this.payrollRepo.listPayrollRuns(tenantId, status);
  }

  // ---------------------------------------------------------------------------
  // Approval Workflow
  // ---------------------------------------------------------------------------

  async approvePayrollRun(
    tenantId: string,
    userId: string,
    runId: string,
  ): Promise<PayrollRunEntity> {
    const run = await this.payrollRepo.findPayrollRunById(tenantId, runId);
    if (!run) {
      throw new NotFoundError('Payroll Run', runId);
    }

    if (run.status !== 'DRAFT' && run.status !== 'AWAITING_APPROVAL') {
      throw new UnprocessableEntityError(
        `Cannot approve payroll run in status '${run.status}'. Only DRAFT or AWAITING_APPROVAL can be approved.`,
      );
    }

    const updated = await this.payrollRepo.updatePayrollRunStatus(tenantId, runId, 'APPROVED', {
      approvedByUserId: userId,
      approvedAt: new Date(),
    });

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'PayrollRun',
      entityId: runId,
      action: 'PAYROLL_RUN_APPROVED',
      newState: { runId, status: 'APPROVED', approvedByUserId: userId },
    });

    return updated;
  }

  async cancelPayrollRun(
    tenantId: string,
    userId: string,
    runId: string,
  ): Promise<PayrollRunEntity> {
    const run = await this.payrollRepo.findPayrollRunById(tenantId, runId);
    if (!run) {
      throw new NotFoundError('Payroll Run', runId);
    }

    if (run.status === 'POSTED') {
      throw new UnprocessableEntityError(
        'Cannot cancel a payroll run that has already been POSTED to the ledger.',
      );
    }

    const updated = await this.payrollRepo.updatePayrollRunStatus(tenantId, runId, 'CANCELLED');

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'PayrollRun',
      entityId: runId,
      action: 'PAYROLL_RUN_CANCELLED',
      newState: { runId, status: 'CANCELLED' },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Ledger Integration: Journal Entries
  // ---------------------------------------------------------------------------

  async postPayrollRunToLedger(
    tenantId: string,
    userId: string,
    runId: string,
  ): Promise<{ run: PayrollRunEntity; journalEntryId: string }> {
    const run = await this.payrollRepo.findPayrollRunById(tenantId, runId);
    if (!run) {
      throw new NotFoundError('Payroll Run', runId);
    }

    if (run.status !== 'APPROVED') {
      throw new UnprocessableEntityError(
        `Cannot post payroll run in status '${run.status}'. Run must be 'APPROVED' before posting to the ledger.`,
      );
    }

    if (run.journalEntryId) {
      throw new ConflictError(
        `Payroll run '${run.runNumber}' has already been posted with journal entry ${run.journalEntryId}`,
      );
    }

    // Chart of Accounts lookup
    const payrollExpenseAccount = await this.ledgerService.findAccountByCode(tenantId, '6020');
    if (!payrollExpenseAccount) {
      throw new NotFoundError('Account', 'Payroll Expense Account 6020 not found');
    }

    const taxPayableAccount = await this.ledgerService.findAccountByCode(tenantId, '2200');
    if (!taxPayableAccount) {
      throw new NotFoundError('Account', 'Sales/Payroll Tax Payable Account 2200 not found');
    }

    const apBenefitsAccount = await this.ledgerService.findAccountByCode(tenantId, '2010');
    if (!apBenefitsAccount) {
      throw new NotFoundError('Account', 'Accounts Payable / Benefits Account 2010 not found');
    }

    const cashAccount = await this.ledgerService.findAccountByCode(tenantId, '1010');
    if (!cashAccount) {
      throw new NotFoundError('Account', 'Operating Checking Account 1010 not found');
    }

    // Construct double-entry journal lines
    // Debit: 6020 Payroll Expense (totalGrossCents)
    // Credit: 2200 Tax Payable (totalTaxCents)
    // Credit: 2010 Benefits / Accounts Payable (totalDeductionsCents)
    // Credit: 1010 Cash (totalNetCents)
    const lines: Array<{
      accountId: string;
      debitCents: bigint;
      creditCents: bigint;
      memo?: string;
    }> = [
      {
        accountId: payrollExpenseAccount.id,
        debitCents: run.totalGrossCents,
        creditCents: 0n,
        memo: `Payroll Gross Expense for ${run.runNumber}`,
      },
    ];

    if (run.totalTaxCents > 0n) {
      lines.push({
        accountId: taxPayableAccount.id,
        debitCents: 0n,
        creditCents: run.totalTaxCents,
        memo: `Payroll Tax Withholdings for ${run.runNumber}`,
      });
    }

    if (run.totalDeductionsCents > 0n) {
      lines.push({
        accountId: apBenefitsAccount.id,
        debitCents: 0n,
        creditCents: run.totalDeductionsCents,
        memo: `Payroll Benefits Deductions for ${run.runNumber}`,
      });
    }

    if (run.totalNetCents > 0n) {
      lines.push({
        accountId: cashAccount.id,
        debitCents: 0n,
        creditCents: run.totalNetCents,
        memo: `Payroll Net Cash Disbursements for ${run.runNumber}`,
      });
    }

    const journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: run.paymentDate,
      description: `Payroll Run ${run.runNumber} for period ${run.payPeriodStart} to ${run.payPeriodEnd}`,
      sourceType: 'PAYROLL',
      sourceId: run.id,
      lines,
    });

    const updatedRun = await this.payrollRepo.updatePayrollRunStatus(tenantId, runId, 'POSTED', {
      journalEntryId: journalEntry.id,
      postedAt: new Date(),
    });

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'PayrollRun',
      entityId: runId,
      action: 'PAYROLL_RUN_POSTED',
      newState: {
        runId,
        journalEntryId: journalEntry.id,
        entryNumber: journalEntry.entryNumber,
      },
    });

    return { run: updatedRun, journalEntryId: journalEntry.id };
  }

  // ---------------------------------------------------------------------------
  // Payslips
  // ---------------------------------------------------------------------------

  async listPayslips(tenantId: string, runId: string): Promise<PayrollItemEntity[]> {
    const run = await this.payrollRepo.findPayrollRunById(tenantId, runId);
    if (!run) {
      throw new NotFoundError('Payroll Run', runId);
    }
    return this.payrollRepo.listPayrollItems(tenantId, runId);
  }

  async getPayslip(
    tenantId: string,
    runId: string,
    employeeId: string,
  ): Promise<{ item: PayrollItemEntity; employee: EmployeeEntity; run: PayrollRunEntity }> {
    const run = await this.payrollRepo.findPayrollRunById(tenantId, runId);
    if (!run) {
      throw new NotFoundError('Payroll Run', runId);
    }

    const employee = await this.payrollRepo.findEmployeeById(tenantId, employeeId);
    if (!employee) {
      throw new NotFoundError('Employee', employeeId);
    }

    const item = await this.payrollRepo.findPayrollItem(tenantId, runId, employeeId);
    if (!item) {
      throw new NotFoundError('Payroll Item', `${runId}:${employeeId}`);
    }

    return { item, employee, run };
  }
}
