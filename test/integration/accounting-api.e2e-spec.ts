import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { INestApplication } from '@nestjs/common';

import { AppModule } from '@/app.module';
import { GlobalExceptionFilter } from '@/core/errors/global-exception.filter';

describe('Accounting API End-to-End Test Suite (Phase 1)', () => {
  let app: INestApplication;
  let userToken: string;
  let tenantId: string;

  let customerId: string;
  let vendorId: string;
  let revenueAccountId: string;
  let expenseAccountId: string;
  let cashAccountId: string;
  let marchPeriodId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Setup User & Organization', async () => {
    const timestamp = Date.now();
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `cfo_${timestamp}@saasplatform.com`,
        password: 'Password123!',
        fullName: 'Chief Financial Officer',
      })
      .expect(201);

    userToken = regRes.body.data.tokens.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        legalName: 'CloudScale SaaS Inc.',
        slug: `cloudscale-saas-${timestamp}`,
        baseCurrency: 'USD',
        timezone: 'America/New_York',
      })
      .expect(201);

    tenantId = orgRes.body.data.id;
    expect(tenantId).toBeDefined();
  });

  it('2. Seed Standard Chart of Accounts & Initialize Fiscal Year', async () => {
    // Seed standard COA
    const seedRes = await request(app.getHttpServer())
      .post('/api/v1/ledger/accounts/seed-standard')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(201);

    expect(seedRes.body.data.length).toBeGreaterThanOrEqual(10);

    // List accounts to find standard IDs
    const accountsRes = await request(app.getHttpServer())
      .get('/api/v1/ledger/accounts')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const accounts = accountsRes.body.data;
    const cash = accounts.find((a: { accountCode: string }) => a.accountCode === '1010');
    const rev = accounts.find((a: { accountCode: string }) => a.accountCode === '4010');
    const exp = accounts.find((a: { accountCode: string }) => a.accountCode === '5010');

    expect(cash).toBeDefined();
    expect(rev).toBeDefined();
    expect(exp).toBeDefined();

    cashAccountId = cash.id;
    revenueAccountId = rev.id;
    expenseAccountId = exp.id;

    // Initialize 2026 Fiscal Year and 12 periods
    const fyRes = await request(app.getHttpServer())
      .post('/api/v1/ledger/fiscal-years')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({ year: 2026 })
      .expect(201);

    expect(fyRes.body.data.periods.length).toBe(12);
    // Period 3 is March 2026
    marchPeriodId = fyRes.body.data.periods[2].id;
    expect(marchPeriodId).toBeDefined();
  }, 15000);

  it('3. Create Customer and Vendor Counterparties', async () => {
    const custRes = await request(app.getHttpServer())
      .post('/api/v1/counterparties')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        legalName: 'Global Enterprises LLC',
        type: 'CUSTOMER',
        taxIdentifier: 'US-987654321',
      })
      .expect(201);

    customerId = custRes.body.data.id;
    expect(customerId).toBeDefined();

    const vendRes = await request(app.getHttpServer())
      .post('/api/v1/counterparties')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        legalName: 'Datadog Cloud Monitoring',
        type: 'VENDOR',
        taxIdentifier: 'US-123456789',
      })
      .expect(201);

    vendorId = vendRes.body.data.id;
    expect(vendorId).toBeDefined();
  });

  it('4. Create and Post Customer Invoice -> Check Ledger Invariant & Trial Balance', async () => {
    // Create draft invoice: 10 enterprise licenses @ $50.00 = $500.00 + $25.00 tax = $525.00
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-2026-0001',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        taxCents: '2500',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Enterprise Tier Subscription - 10 seats',
            quantity: 10,
            unitCostCents: '5000',
          },
        ],
      })
      .expect(201);

    const invoice = invRes.body.data;
    expect(invoice.subtotalCents).toBe('50000');
    expect(invoice.totalCents).toBe('52500');
    expect(invoice.status).toBe('DRAFT');

    // Post invoice to authoritative ledger
    const postRes = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.id}/post`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(postRes.body.data.status).toBe('POSTED');
    expect(postRes.body.data.journalEntryId).toBeDefined();

    // Verify Trial Balance is balanced: totalDebits == totalCredits == $525.00
    const tbRes = await request(app.getHttpServer())
      .get(`/api/v1/ledger/reports/trial-balance?periodId=${marchPeriodId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(tbRes.body.data.isBalanced).toBe(true);
    expect(tbRes.body.data.totalDebitCents).toBe('52500');
    expect(tbRes.body.data.totalCreditCents).toBe('52500');
  });

  it('5. Record Customer Payment & Verify Financial Statements', async () => {
    // Find invoice
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const invoice = listRes.body.data[0];

    // Record full payment of $525.00
    const payRes = await request(app.getHttpServer())
      .post('/api/v1/invoices/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        counterpartyId: customerId,
        paymentAccountId: cashAccountId,
        paymentType: 'RECEIPT',
        paymentDate: '2026-03-15',
        paymentMethod: 'WIRE',
        referenceNumber: 'WIRE-998877',
        amountCents: '52500',
        allocations: [
          {
            invoiceId: invoice.id,
            allocatedAmountCents: '52500',
          },
        ],
      })
      .expect(201);

    expect(payRes.body.data.id).toBeDefined();

    // Verify invoice is now PAID and amountDue is 0
    const updatedInvRes = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(updatedInvRes.body.data.status).toBe('PAID');
    expect(updatedInvRes.body.data.amountDueCents).toBe('0');

    // Verify Profit and Loss report: Revenue = $500.00, Net Income = $500.00
    const pnlRes = await request(app.getHttpServer())
      .get(`/api/v1/ledger/reports/profit-and-loss?periodId=${marchPeriodId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(pnlRes.body.data.totalRevenueCents).toBe('50000');
    expect(pnlRes.body.data.netIncomeCents).toBe('50000');

    // Verify Balance Sheet is strictly balanced:
    // Assets (Cash: $525.00) == Liabilities (Sales Tax Payable: $25.00) + Equity (Retained Earnings / Net Income: $500.00)
    const bsRes = await request(app.getHttpServer())
      .get(`/api/v1/ledger/reports/balance-sheet?asOfPeriodId=${marchPeriodId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(bsRes.body.data.isBalanced).toBe(true);
    expect(bsRes.body.data.totalAssetsCents).toBe('52500');
    expect(bsRes.body.data.totalLiabilitiesCents).toBe('2500');
    expect(bsRes.body.data.retainedEarningsCents).toBe('50000');
  });

  it('6. Create Vendor Bill, Post, and Void with Reversal Audit Trail', async () => {
    // 1. Create vendor bill
    const billRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        counterpartyId: vendorId,
        invoiceType: 'BILL',
        invoiceNumber: 'BILL-DD-101',
        issueDate: '2026-03-02',
        dueDate: '2026-03-20',
        currency: 'USD',
        lines: [
          {
            accountId: expenseAccountId,
            description: 'APM infrastructure monitoring',
            quantity: 1,
            unitCostCents: '15000', // $150.00
          },
        ],
      })
      .expect(201);

    const bill = billRes.body.data;

    // 2. Post vendor bill
    const postRes = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${bill.id}/post`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(postRes.body.data.status).toBe('POSTED');

    // 3. Void vendor bill (triggers reversal)
    const voidRes = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${bill.id}/void`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        reason: 'Duplicate bill received from vendor; cancelled per vendor confirmation',
      })
      .expect(200);

    expect(voidRes.body.data.status).toBe('VOID');

    // 4. Verify Trial Balance shows Expense reversed back to 0
    const tbRes = await request(app.getHttpServer())
      .get(`/api/v1/ledger/reports/trial-balance?periodId=${marchPeriodId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(tbRes.body.data.isBalanced).toBe(true);
    const expItem = tbRes.body.data.items.find(
      (i: { accountId: string }) => i.accountId === expenseAccountId,
    );
    expect(expItem.debitBalanceCents).toBe('0');
  });
});
