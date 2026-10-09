import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { INestApplication } from '@nestjs/common';

import { AppModule } from '@/app.module';
import { GlobalExceptionFilter } from '@/core/errors/global-exception.filter';
import { AuditService } from '@/modules/audit/services/audit.service';

describe('Master End-to-End Business Lifecycle (10 Domains Unified)', () => {
  let app: INestApplication;
  let auditService: AuditService;

  let userToken: string;
  let tenantId: string;
  let userId: string;

  // Ledger Account IDs
  let cashAccountId: string;
  let arAccountId: string;
  let inventoryAccountId: string;
  let apAccountId: string;
  let salesAccountId: string;
  let cogsAccountId: string;
  let periodId: string;

  // Entity IDs
  let customerId: string;
  let vendorId: string;
  let productId: string;
  let invoiceId: string;
  let bankAccountId: string;
  let employeeId: string;
  let payrollRunId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    auditService = app.get(AuditService);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
  });

  it('1. Identity & Organization Setup', async () => {
    const timestamp = Date.now();
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `founder_${timestamp}@omnicorp.com`,
        password: 'Password123!',
        fullName: 'Executive Founder',
      })
      .expect(201);

    userToken = regRes.body.data.tokens.accessToken;
    userId = regRes.body.data.user.id;
    expect(userToken).toBeDefined();
    expect(userId).toBeDefined();

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        legalName: 'OmniCorp Technologies Inc.',
        slug: `omnicorp-${timestamp}`,
        baseCurrency: 'USD',
        timezone: 'America/New_York',
      })
      .expect(201);

    tenantId = orgRes.body.data.id;
    expect(tenantId).toBeDefined();
  });

  it('2. Ledger Core Initialization (COA & Fiscal Periods)', async () => {
    // Seed standard chart of accounts
    const seedRes = await request(app.getHttpServer())
      .post('/api/v1/ledger/accounts/seed-standard')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(201);

    expect(seedRes.body.data.length).toBeGreaterThanOrEqual(10);

    // Fetch accounts to retrieve authoritative IDs
    const accountsRes = await request(app.getHttpServer())
      .get('/api/v1/ledger/accounts')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const accounts = accountsRes.body.data;
    const cash = accounts.find((a: { accountCode: string }) => a.accountCode === '1010');
    const ar = accounts.find((a: { accountCode: string }) => a.accountCode === '1200');
    const inv = accounts.find((a: { accountCode: string }) => a.accountCode === '1500'); // Inventory Asset (1500)
    const ap = accounts.find((a: { accountCode: string }) => a.accountCode === '2010');
    const sales = accounts.find((a: { accountCode: string }) => a.accountCode === '4010');
    const cogs = accounts.find((a: { accountCode: string }) => a.accountCode === '5010');
    const payroll = accounts.find((a: { accountCode: string }) => a.accountCode === '6020'); // Payroll Expense (6020)

    expect(cash).toBeDefined();
    expect(ar).toBeDefined();
    expect(inv).toBeDefined();
    expect(ap).toBeDefined();
    expect(sales).toBeDefined();
    expect(cogs).toBeDefined();
    expect(payroll).toBeDefined();

    cashAccountId = cash.id;
    arAccountId = ar.id;
    inventoryAccountId = inv.id;
    apAccountId = ap.id;
    salesAccountId = sales.id;
    cogsAccountId = cogs.id;

    // Initialize 2026 Fiscal Year & 12 Monthly Periods
    const fyRes = await request(app.getHttpServer())
      .post('/api/v1/ledger/fiscal-years')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({ year: 2026 })
      .expect(201);

    expect(fyRes.body.data.periods.length).toBe(12);
    periodId = fyRes.body.data.periods[0].id; // Period 1: Jan 2026
    expect(periodId).toBeDefined();
  }, 20000);

  it('3. Counterparties Setup (Customer & Vendor)', async () => {
    // Register Customer
    const custRes = await request(app.getHttpServer())
      .post('/api/v1/counterparties')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        legalName: 'Acme Enterprise Corp',
        type: 'CUSTOMER',
        taxIdentifier: 'US-887766554',
      })
      .expect(201);

    customerId = custRes.body.data.id;
    expect(customerId).toBeDefined();

    // Register Vendor
    const vendRes = await request(app.getHttpServer())
      .post('/api/v1/counterparties')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        legalName: 'Apex Hardware Distributors',
        type: 'VENDOR',
        taxIdentifier: 'US-112233445',
      })
      .expect(201);

    vendorId = vendRes.body.data.id;
    expect(vendorId).toBeDefined();
  });

  it('4. Inventory Intake (Purchasing Stock Batch)', async () => {
    // Create Product SKU
    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        sku: 'WIDGET-SERIES-9',
        name: 'Enterprise Ultra Widget',
        description: 'Next-gen enterprise hardware item',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
        inventoryAccountId,
        cogsAccountId,
        salesAccountId,
        lowStockThreshold: 10,
        reorderQuantity: 50,
      })
      .expect(201);

    productId = prodRes.body.data.id;
    expect(productId).toBeDefined();
    expect(prodRes.body.data.sku).toBe('WIDGET-SERIES-9');

    // Inflow purchase batch: 100 units @ $10.00 each = $1,000.00 (1000 cents unit cost)
    const purchaseRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/purchases')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        productId,
        batchReference: 'BATCH-2026-001',
        receivedDate: '2026-01-10',
        quantity: 100,
        unitCostCents: 1000,
        offsetAccountId: apAccountId,
      })
      .expect(201);

    expect(purchaseRes.body.data.batch.remainingQuantity).toBe(100);

    // Verify stock balance
    const balanceRes = await request(app.getHttpServer())
      .get(`/api/v1/inventory/products/${productId}/stock-balance`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(balanceRes.body.data.availableStock).toBe(100);
  });

  it('5. Customer Invoicing & Sales with FIFO Depletion', async () => {
    // Create Customer Invoice: 30 units @ $25.00 each = $750.00 (75000 cents)
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-2026-001',
        issueDate: '2026-01-15',
        dueDate: '2026-02-14',
        currency: 'USD',
        taxCents: '0',
        lines: [
          {
            accountId: salesAccountId,
            description: 'Enterprise Ultra Widget (30 units)',
            quantity: 30,
            unitCostCents: '2500',
          },
        ],
      })
      .expect(201);

    invoiceId = invRes.body.data.id;
    expect(invoiceId).toBeDefined();

    // Post the Invoice to the General Ledger
    const postRes = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/post`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(postRes.body.data.status).toBe('POSTED');

    // Record inventory sale outflow: 30 units depleted from Batch 1 @ $10.00 = $300.00 COGS (30000 cents)
    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/sales')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        productId,
        quantity: 30,
        unitPriceCents: 2500,
        saleDate: '2026-01-15',
        offsetAccountId: arAccountId,
        referenceNumber: 'INV-2026-001',
      })
      .expect(201);

    expect(saleRes.body.data.cogsCents).toBe('30000');

    // Confirm remaining stock is now 70 units
    const balanceRes = await request(app.getHttpServer())
      .get(`/api/v1/inventory/products/${productId}/stock-balance`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(balanceRes.body.data.availableStock).toBe(70);
  });

  it('6. Banking Statement Ingestion & Automated Match', async () => {
    // Create Bank Account linked to Cash Account (1010)
    const bankRes = await request(app.getHttpServer())
      .post('/api/v1/banking/accounts')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        ledgerAccountId: cashAccountId,
        accountName: 'Operating Checking',
        institutionName: 'Silicon Valley Bank',
        accountType: 'CHECKING',
        currency: 'USD',
        accountNumberLast4: '9988',
      })
      .expect(201);

    bankAccountId = bankRes.body.data.id;
    expect(bankAccountId).toBeDefined();

    // Ingest CSV statement with $750.00 customer deposit
    const csvContent = `date,description,amount\n2026-01-20,Wire Transfer Acme Enterprise Corp INV-2026-001,750.00`;
    const stmtRes = await request(app.getHttpServer())
      .post('/api/v1/banking/statements/upload')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        bankAccountId,
        fileName: 'statement_jan_2026.csv',
        mimeType: 'text/csv',
        content: csvContent,
      })
      .expect(201);

    expect(stmtRes.body.data.transactions.length).toBe(1);

    // List proposals
    const proposalsRes = await request(app.getHttpServer())
      .get('/api/v1/banking/proposals')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const proposals = proposalsRes.body.data;
    if (proposals.length > 0) {
      const p = proposals[0];
      if (p.status === 'PENDING') {
        const approveRes = await request(app.getHttpServer())
          .post(`/api/v1/banking/proposals/${p.id}/approve`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', tenantId)
          .expect(200);

        expect(approveRes.body.data.status).toBe('APPROVED');
      } else {
        // High confidence match was autonomously approved by deterministic gate
        expect(p.status).toBe('APPROVED');
      }
    }
  });

  it('7. Deterministic Payroll Lifecycle', async () => {
    // Onboard Employee
    const empRes = await request(app.getHttpServer())
      .post('/api/v1/payroll/employees')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        firstName: 'Alice',
        lastName: 'Engineer',
        email: `alice_${Date.now()}@omnicorp.com`,
        ssnLast4: '1234',
        department: 'Engineering',
        jobTitle: 'Senior Platform Engineer',
        payType: 'SALARY',
        rateCents: 12000000, // $120,000 / year
        hireDate: '2026-01-01',
      })
      .expect(201);

    employeeId = empRes.body.data.id;
    expect(employeeId).toBeDefined();

    // Set Compensation Config (24 pay periods, 1500 bps = 15% tax withholding)
    await request(app.getHttpServer())
      .post(`/api/v1/payroll/employees/${employeeId}/compensation`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        payPeriodsPerYear: 24,
        taxWithholdingRateBasisPoints: 1500,
        standardDeductionCents: 0,
        retirementContributionRateBasisPoints: 500, // 5%
        directDepositAccountLast4: '4321',
      })
      .expect(200);

    // Create Payroll Run for period
    const runRes = await request(app.getHttpServer())
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        payPeriodStart: '2026-01-01',
        payPeriodEnd: '2026-01-15',
        paymentDate: '2026-01-16',
      })
      .expect(201);

    payrollRunId = runRes.body.data.run.id;
    expect(payrollRunId).toBeDefined();
    expect(runRes.body.data.run.totalGrossCents).toBe('500000'); // $5,000.00 gross

    // Approve the Payroll Run
    await request(app.getHttpServer())
      .post(`/api/v1/payroll/runs/${payrollRunId}/approve`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    // Post Payroll Run to Ledger
    const postPayrollRes = await request(app.getHttpServer())
      .post(`/api/v1/payroll/runs/${payrollRunId}/post`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(postPayrollRes.body.data.run.status).toBe('POSTED');
  });

  it('8. Inventory Recount & Adjustment', async () => {
    // Record stock write-off: 5 damaged units (delta = -5)
    const adjRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        productId,
        adjustmentType: 'ADJUSTMENT_WRITE_OFF',
        quantityDelta: -5,
        adjustmentDate: '2026-01-25',
        reason: '5 units damaged during warehouse transit',
      })
      .expect(201);

    expect(adjRes.body.data.movement.quantity).toBe(-5);

    // Verify stock balance is now 65 units
    const balanceRes = await request(app.getHttpServer())
      .get(`/api/v1/inventory/products/${productId}/stock-balance`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(balanceRes.body.data.availableStock).toBe(65);

    // Calculate valuation: 65 units @ $10.00 = $650.00 (65000 cents)
    const valRes = await request(app.getHttpServer())
      .get('/api/v1/inventory/valuation')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(valRes.body.data.products.length).toBeGreaterThanOrEqual(1);
    const item = valRes.body.data.products.find(
      (p: { productId: string }) => p.productId === productId,
    );
    expect(item).toBeDefined();
    expect(item.totalQuantity).toBe(65);
    expect(item.totalValuationCents).toBe('65000');
  });

  it('9. Ledger Trial Balance & Financial Invariant Verification', async () => {
    // Query Trial Balance with periodId
    const tbRes = await request(app.getHttpServer())
      .get(`/api/v1/ledger/reports/trial-balance?periodId=${periodId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const tb = tbRes.body.data;
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebitsCents).toBe(tb.totalCreditsCents);

    // Query Profit and Loss with periodId
    const plRes = await request(app.getHttpServer())
      .get(`/api/v1/ledger/reports/profit-and-loss?periodId=${periodId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(plRes.body.data.totalRevenueCents).toBeDefined();
    expect(plRes.body.data.totalExpenseCents).toBeDefined();
  });

  it('10. Immutable Cryptographic Audit Chain Verification', async () => {
    // Verify that every single state change across all domains forms an unbroken cryptographic chain
    const verification = await auditService.verifyChain(tenantId);
    if (!verification.isValid) {
      console.error('Audit verification failure details:', verification);
    }
    expect(verification.isValid).toBe(true);
    expect(verification.brokenAtEventId).toBeUndefined();
    expect(verification.totalVerified).toBeGreaterThanOrEqual(5);
  });
});
