import { describe, it, expect, beforeEach } from 'vitest';

import {
  ConflictError,
  UnprocessableEntityError,
  ValidationError,
} from '../../src/core/errors/app-error';
import { InMemoryAuditRepository } from '../../src/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { InMemoryLedgerRepository } from '../../src/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';
import { InMemoryPayrollRepository } from '../../src/modules/payroll/repositories/in-memory-payroll.repository';
import { PayrollService } from '../../src/modules/payroll/services/payroll.service';

describe('PayrollService (Deterministic Domain Calculations & Invariants)', () => {
  let payrollService: PayrollService;
  let ledgerService: LedgerService;
  let payrollRepo: InMemoryPayrollRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditRepository;
  let auditService: AuditService;

  const tenantId = 'tenant-payroll-001';
  const userId = 'user-payroll-001';

  beforeEach(async () => {
    payrollRepo = new InMemoryPayrollRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditRepository();
    auditService = new AuditService(auditRepo);

    ledgerService = new LedgerService(ledgerRepo, auditService);
    payrollService = new PayrollService(payrollRepo, ledgerService, auditService);

    // Seed COA & Fiscal Periods
    await ledgerService.seedStandardChartOfAccounts(tenantId);
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);
  });

  describe('Employee Management & Compensation Configuration', () => {
    it('creates an employee and sets compensation config', async () => {
      const employee = await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        ssnLast4: '1234',
        department: 'Engineering',
        jobTitle: 'Senior Software Engineer',
        payType: 'SALARY',
        rateCents: 120_000_00n, // $120,000 / year
        hireDate: '2026-01-01',
      });

      expect(employee.id).toBeDefined();
      expect(employee.status).toBe('ACTIVE');
      expect(employee.rateCents).toBe(120_000_00n);

      const config = await payrollService.setCompensationConfig(tenantId, userId, employee.id, {
        payPeriodsPerYear: 24, // Semi-monthly
        taxWithholdingRateBasisPoints: 2000, // 20.00%
        standardDeductionCents: 150_00n, // $150 health benefits
        retirementContributionRateBasisPoints: 500, // 5.00% 401(k)
        directDepositAccountLast4: '9876',
      });

      expect(config.payPeriodsPerYear).toBe(24);
      expect(config.taxWithholdingRateBasisPoints).toBe(2000);
      expect(config.standardDeductionCents).toBe(150_00n);
      expect(config.retirementContributionRateBasisPoints).toBe(500);

      const retrievedConfig = await payrollService.getCompensationConfig(tenantId, employee.id);
      expect(retrievedConfig?.employeeId).toBe(employee.id);
    });

    it('prevents creating duplicate employee with same email', async () => {
      await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@example.com',
        ssnLast4: '4321',
        department: 'Operations',
        jobTitle: 'Ops Specialist',
        payType: 'HOURLY',
        rateCents: 35_00n,
        hireDate: '2026-01-15',
      });

      await expect(
        payrollService.createEmployee(tenantId, userId, {
          firstName: 'Robert',
          lastName: 'Jones',
          email: 'bob@example.com',
          ssnLast4: '4321',
          department: 'Operations',
          jobTitle: 'Ops Specialist',
          payType: 'HOURLY',
          rateCents: 35_00n,
          hireDate: '2026-01-15',
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('updates employee details', async () => {
      const employee = await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Carol',
        lastName: 'Danvers',
        email: 'carol@example.com',
        ssnLast4: '9999',
        department: 'Marketing',
        jobTitle: 'Marketing Lead',
        payType: 'SALARY',
        rateCents: 96_000_00n,
        hireDate: '2026-02-01',
      });

      const updated = await payrollService.updateEmployee(tenantId, userId, employee.id, {
        jobTitle: 'VP of Marketing',
        rateCents: 110_000_00n,
      });

      expect(updated.jobTitle).toBe('VP of Marketing');
      expect(updated.rateCents).toBe(110_000_00n);
      expect(updated.version).toBe(2);
    });
  });

  describe('Deterministic Payroll Calculations & Payslips', () => {
    it('calculates deterministic payroll for salary and hourly employees with invariants satisfied', async () => {
      // 1. Create Salaried Employee: $120,000/yr / 24 periods = $5,000.00 gross per period
      const alice = await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        ssnLast4: '1111',
        department: 'Engineering',
        jobTitle: 'Senior Software Engineer',
        payType: 'SALARY',
        rateCents: 120_000_00n,
        hireDate: '2026-01-01',
      });

      await payrollService.setCompensationConfig(tenantId, userId, alice.id, {
        payPeriodsPerYear: 24,
        taxWithholdingRateBasisPoints: 2000, // 20% tax = $1,000.00
        standardDeductionCents: 150_00n, // $150.00
        retirementContributionRateBasisPoints: 500, // 5% = $250.00
      });

      // 2. Create Hourly Employee: $40.00/hr, 80 hours worked = $3,200.00 gross
      const bob = await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Bob',
        lastName: 'Brown',
        email: 'bob@example.com',
        ssnLast4: '2222',
        department: 'Support',
        jobTitle: 'Support Engineer',
        payType: 'HOURLY',
        rateCents: 40_00n,
        hireDate: '2026-01-01',
      });

      await payrollService.setCompensationConfig(tenantId, userId, bob.id, {
        payPeriodsPerYear: 24,
        taxWithholdingRateBasisPoints: 1500, // 15% tax = $480.00
        standardDeductionCents: 100_00n, // $100.00
        retirementContributionRateBasisPoints: 300, // 3% = $96.00
      });

      // 3. Create Payroll Run for January 2026
      const { run, items } = await payrollService.createPayrollRun(tenantId, userId, {
        payPeriodStart: '2026-01-01',
        payPeriodEnd: '2026-01-15',
        paymentDate: '2026-01-16',
        employeeHours: [{ employeeId: bob.id, hoursWorked: 80 }],
      });

      expect(run.status).toBe('DRAFT');
      expect(items.length).toBe(2);

      // Verify Alice's deterministic calculation
      const aliceItem = items.find((i) => i.employeeId === alice.id);
      expect(aliceItem).toBeDefined();
      if (!aliceItem) {
        throw new Error('aliceItem not found');
      }
      expect(aliceItem.grossPayCents).toBe(5000_00n);
      expect(aliceItem.taxWithholdingsCents).toBe(1000_00n); // 20% of 5000
      // deductions = 250 (retirement 5%) + 150 (standard) = 400
      expect(aliceItem.deductionsCents).toBe(400_00n);
      // net = 5000 - 1000 - 400 = 3600
      expect(aliceItem.netPayCents).toBe(3600_00n);
      // Mathematical Invariant
      expect(aliceItem.grossPayCents).toBe(
        aliceItem.netPayCents + aliceItem.taxWithholdingsCents + aliceItem.deductionsCents,
      );

      // Verify Bob's deterministic calculation
      const bobItem = items.find((i) => i.employeeId === bob.id);
      expect(bobItem).toBeDefined();
      if (!bobItem) {
        throw new Error('bobItem not found');
      }
      expect(bobItem.grossPayCents).toBe(3200_00n); // 80 hrs * 4000 cents
      expect(bobItem.taxWithholdingsCents).toBe(480_00n); // 15% of 3200
      // deductions = 96 (retirement 3%) + 100 (standard) = 196
      expect(bobItem.deductionsCents).toBe(196_00n);
      // net = 3200 - 480 - 196 = 2524
      expect(bobItem.netPayCents).toBe(2524_00n);
      // Mathematical Invariant
      expect(bobItem.grossPayCents).toBe(
        bobItem.netPayCents + bobItem.taxWithholdingsCents + bobItem.deductionsCents,
      );

      // Verify Run Totals
      expect(run.totalGrossCents).toBe(aliceItem.grossPayCents + bobItem.grossPayCents);
      expect(run.totalTaxCents).toBe(aliceItem.taxWithholdingsCents + bobItem.taxWithholdingsCents);
      expect(run.totalDeductionsCents).toBe(aliceItem.deductionsCents + bobItem.deductionsCents);
      expect(run.totalNetCents).toBe(aliceItem.netPayCents + bobItem.netPayCents);

      expect(run.totalGrossCents).toBe(
        run.totalNetCents + run.totalTaxCents + run.totalDeductionsCents,
      );
    });

    it('rejects payroll run when date range is inverted', async () => {
      await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Dan',
        lastName: 'Miller',
        email: 'dan@example.com',
        ssnLast4: '5555',
        department: 'Ops',
        jobTitle: 'Driver',
        payType: 'SALARY',
        rateCents: 50_000_00n,
        hireDate: '2026-01-01',
      });

      await expect(
        payrollService.createPayrollRun(tenantId, userId, {
          payPeriodStart: '2026-01-20',
          payPeriodEnd: '2026-01-10', // Invalid: end before start
          paymentDate: '2026-01-25',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects duplicate payroll run for the same period', async () => {
      await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Emma',
        lastName: 'Stone',
        email: 'emma@example.com',
        ssnLast4: '7777',
        department: 'HR',
        jobTitle: 'HR Director',
        payType: 'SALARY',
        rateCents: 90_000_00n,
        hireDate: '2026-01-01',
      });

      await payrollService.createPayrollRun(tenantId, userId, {
        payPeriodStart: '2026-02-01',
        payPeriodEnd: '2026-02-15',
        paymentDate: '2026-02-16',
      });

      await expect(
        payrollService.createPayrollRun(tenantId, userId, {
          payPeriodStart: '2026-02-01',
          payPeriodEnd: '2026-02-15',
          paymentDate: '2026-02-16',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('Approval Workflow & Double-Entry Ledger Integration', () => {
    it('enforces approval gate before posting to ledger and produces balanced journal entry', async () => {
      const employee = await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Frank',
        lastName: 'Sinatra',
        email: 'frank@example.com',
        ssnLast4: '8888',
        department: 'Executive',
        jobTitle: 'President',
        payType: 'SALARY',
        rateCents: 240_000_00n, // $10,000 / period
        hireDate: '2026-01-01',
      });

      await payrollService.setCompensationConfig(tenantId, userId, employee.id, {
        payPeriodsPerYear: 24,
        taxWithholdingRateBasisPoints: 2500, // 25% tax = $2,500
        standardDeductionCents: 500_00n, // $500
        retirementContributionRateBasisPoints: 1000, // 10% = $1,000
      });

      const { run } = await payrollService.createPayrollRun(tenantId, userId, {
        payPeriodStart: '2026-03-01',
        payPeriodEnd: '2026-03-15',
        paymentDate: '2026-03-16',
      });

      // 1. Attempting to post unapproved run must fail
      await expect(payrollService.postPayrollRunToLedger(tenantId, userId, run.id)).rejects.toThrow(
        UnprocessableEntityError,
      );

      // 2. Approve Run
      const approved = await payrollService.approvePayrollRun(tenantId, userId, run.id);
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedByUserId).toBe(userId);

      // 3. Post Run to Ledger
      const { run: postedRun, journalEntryId } = await payrollService.postPayrollRunToLedger(
        tenantId,
        userId,
        run.id,
      );
      expect(postedRun.status).toBe('POSTED');
      expect(postedRun.journalEntryId).toBe(journalEntryId);

      // 4. Verify General Ledger Entry
      const entry = await ledgerService.getEntryById(tenantId, journalEntryId);
      expect(entry).toBeDefined();
      if (!entry) {
        throw new Error('Journal entry not found');
      }

      expect(entry.sourceType).toBe('PAYROLL');
      expect(entry.sourceId).toBe(run.id);

      // Double-entry validation: sum(Debits) === sum(Credits)
      expect(entry.totalDebitCents).toBe(10_000_00n);
      expect(entry.totalCreditCents).toBe(10_000_00n);

      // Verify specific line items
      const grossLine = entry.lines.find((l) => l.debitCents > 0n);
      expect(grossLine?.debitCents).toBe(10_000_00n); // 6020 Payroll Expense

      const creditSum = entry.lines.reduce((s, l) => s + l.creditCents, 0n);
      expect(creditSum).toBe(10_000_00n);

      // 5. Prevent double posting
      await expect(payrollService.postPayrollRunToLedger(tenantId, userId, run.id)).rejects.toThrow(
        UnprocessableEntityError,
      );
    });

    it('prevents cancelling an already posted payroll run', async () => {
      await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        ssnLast4: '3333',
        department: 'Research',
        jobTitle: 'Chief Scientist',
        payType: 'SALARY',
        rateCents: 120_000_00n,
        hireDate: '2026-01-01',
      });

      const { run } = await payrollService.createPayrollRun(tenantId, userId, {
        payPeriodStart: '2026-04-01',
        payPeriodEnd: '2026-04-15',
        paymentDate: '2026-04-16',
      });

      await payrollService.approvePayrollRun(tenantId, userId, run.id);
      await payrollService.postPayrollRunToLedger(tenantId, userId, run.id);

      await expect(payrollService.cancelPayrollRun(tenantId, userId, run.id)).rejects.toThrow(
        UnprocessableEntityError,
      );
    });
  });

  describe('Audit Trail & Payslip Queries', () => {
    it('retrieves detailed payslip and verifies tamper-evident audit log', async () => {
      const employee = await payrollService.createEmployee(tenantId, userId, {
        firstName: 'Hank',
        lastName: 'Pym',
        email: 'hank@example.com',
        ssnLast4: '6666',
        department: 'Biotech',
        jobTitle: 'Scientist',
        payType: 'SALARY',
        rateCents: 96_000_00n,
        hireDate: '2026-01-01',
      });

      const { run } = await payrollService.createPayrollRun(tenantId, userId, {
        payPeriodStart: '2026-05-01',
        payPeriodEnd: '2026-05-15',
        paymentDate: '2026-05-16',
      });

      const payslip = await payrollService.getPayslip(tenantId, run.id, employee.id);
      expect(payslip.employee.id).toBe(employee.id);
      expect(payslip.run.id).toBe(run.id);
      expect(payslip.item.grossPayCents).toBe(4000_00n);

      // Verify audit chain integrity
      const auditChain = await auditService.verifyChain(tenantId);
      expect(auditChain.isValid).toBe(true);
      expect(auditChain.totalVerified).toBeGreaterThan(0);
    });
  });
});
