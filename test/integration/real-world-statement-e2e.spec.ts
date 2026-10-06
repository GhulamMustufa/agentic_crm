import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { INestApplication } from '@nestjs/common';

import { AppModule } from '@/app.module';
import { GlobalExceptionFilter } from '@/core/errors/global-exception.filter';

function createSamplePdfBuffer(params: {
  period: string;
  openingBalance: string;
  closingBalance: string;
  lines: Array<{ date: string; description: string; amount: string }>;
}): Buffer {
  const content = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Length 1000 >>',
    'stream',
    '================================================================',
    '                 MERCURY COMMERCIAL BANK STATEMENT              ',
    '================================================================',
    `Statement Period: ${params.period}`,
    `Starting Balance: ${params.openingBalance}`,
    `Ending Balance: ${params.closingBalance}`,
    '',
    'DATE        DESCRIPTION                             AMOUNT',
    '----------------------------------------------------------------',
    ...params.lines.map((l) => `${l.date}  ${l.description.padEnd(38, ' ')}  ${l.amount}`),
    '================================================================',
    'endstream',
    'endobj',
    'xref',
    '0 2',
    '0000000000 65535 f ',
    '0000000010 00000 n ',
    'trailer',
    '<< /Size 2 >>',
    'startxref',
    '500',
    '%%EOF',
  ].join('\n');

  return Buffer.from(content, 'utf-8');
}

describe('Real-World End-to-End Master Scenarios (6 Variations & Object Storage)', () => {
  let app: INestApplication;

  let tenantAToken: string;
  let tenantAId: string;
  let tenantABankAccountId: string;

  let tenantBToken: string;
  let tenantBId: string;

  let sample1PdfBase64: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  }, 45000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Setup: Register Tenant A, Seed COA, and Register Operating Bank Account', async () => {
    const ts = Date.now();
    // 1. Register User
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `ceo_${ts}@apexventures.io`,
        password: 'Password123!Secure',
        fullName: 'Sarah Apex',
      })
      .expect(201);

    tenantAToken = regRes.body.data.tokens.accessToken;
    expect(regRes.body.data.user.id).toBeDefined();

    // 2. Create Organization
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({
        legalName: `Apex Ventures ${ts}`,
        slug: `apex-${ts}`,
        baseCurrency: 'USD',
        timezone: 'UTC',
      })
      .expect(201);

    tenantAId = orgRes.body.data.id;

    // 3. Seed Standard Chart of Accounts
    const seedRes = await request(app.getHttpServer())
      .post('/api/v1/ledger/accounts/seed-standard')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .expect(201);

    const accounts = seedRes.body.data;
    const cashAcc = accounts.find((a: { accountCode: string }) => a.accountCode === '1010');
    expect(cashAcc).toBeDefined();

    // 4. Create Bank Account
    const bankRes = await request(app.getHttpServer())
      .post('/api/v1/banking/accounts')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        ledgerAccountId: cashAcc.id,
        accountName: 'Mercury Primary Checking',
        institutionName: 'Mercury Bank',
        accountType: 'CHECKING',
        currency: 'USD',
        accountNumberLast4: '8841',
      })
      .expect(201);

    tenantABankAccountId = bankRes.body.data.id;
    expect(tenantABankAccountId).toBeDefined();
  });

  it('Variation 1: Clean Standard Bank Statement PDF (Live Extraction, S3 Archival & GL Matching)', async () => {
    const pdfBuf = createSamplePdfBuffer({
      period: '2026-10-01 to 2026-10-31',
      openingBalance: '$50,000.00',
      closingBalance: '$74,200.00',
      lines: [
        { date: '2026-10-05', description: 'Starlight Client Wire Inflow', amount: '$30,000.00' },
        { date: '2026-10-12', description: 'Cloudflare Network Hosting CDN', amount: '-$1,400.00' },
        {
          date: '2026-10-20',
          description: 'Gusto Payroll Direct Deposit Run',
          amount: '-$4,400.00',
        },
      ],
    });

    sample1PdfBase64 = pdfBuf.toString('base64');

    const res = await request(app.getHttpServer())
      .post('/api/v1/banking/statements/upload')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        bankAccountId: tenantABankAccountId,
        fileName: 'October_2026_Mercury_Statement.pdf',
        mimeType: 'application/pdf',
        content: sample1PdfBase64,
      })
      .expect(201);

    const { statement, transactions, proposals } = res.body.data;
    expect(statement.id).toBeDefined();

    expect(statement.status).toBe('PARSED');
    expect(transactions).toHaveLength(3);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // Verify transactions in database
    const txRes = await request(app.getHttpServer())
      .get(`/api/v1/banking/transactions?bankAccountId=${tenantABankAccountId}`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .expect(200);

    expect(txRes.body.data).toHaveLength(3);
  });

  it('Variation 2: Ambiguous Vendor PDF -> Exceptions Center Routing & Human Approval', async () => {
    const pdfBuf = createSamplePdfBuffer({
      period: '2026-11-01 to 2026-11-30',
      openingBalance: '$74,200.00',
      closingBalance: '$72,650.00',
      lines: [
        {
          date: '2026-11-04',
          description: 'TST* SQ MERCH 91238 UNKNOWN LOCATION',
          amount: '-$350.00',
        },
        {
          date: '2026-11-15',
          description: 'POS DEBIT CARD SWIPE 0092 UNRECOGNIZED',
          amount: '-$1,200.00',
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/banking/statements/upload')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        bankAccountId: tenantABankAccountId,
        fileName: 'November_2026_Mercury_Statement.pdf',
        mimeType: 'application/pdf',
        content: pdfBuf.toString('base64'),
      });

    if (res.status !== 201) {
      console.log('VARIATION 2 ERROR:', res.status, JSON.stringify(res.body));
    }
    expect(res.status).toBe(201);

    expect(res.body.data.transactions).toHaveLength(2);

    // Fetch live exceptions
    const excRes = await request(app.getHttpServer())
      .get('/api/v1/banking/exceptions')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .expect(200);

    const exceptions = excRes.body.data;
    expect(exceptions.length).toBeGreaterThanOrEqual(1);

    // Human supervisor resolves an exception
    const firstException = exceptions[0];
    const resolveRes = await request(app.getHttpServer())
      .post(`/api/v1/banking/exceptions/${firstException.id}/resolve`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        status: 'RESOLVED',
        resolutionNotes: 'Approved as General Office Expense after reviewing receipt.',
      })
      .expect(200);

    expect(resolveRes.body.data.status).toBe('RESOLVED');
  });

  it('Variation 3: Exact Duplicate PDF Statement -> Cryptographic SHA-256 Prevention (409 Conflict)', async () => {
    // Re-uploading the exact same PDF bytes as Variation 1
    const res = await request(app.getHttpServer())
      .post('/api/v1/banking/statements/upload')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        bankAccountId: tenantABankAccountId,
        fileName: 'Duplicate_Upload.pdf',
        mimeType: 'application/pdf',
        content: sample1PdfBase64,
      });

    // Must be rejected with 409 Conflict
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Duplicate statement rejected');
  });

  it('Variation 4: Period Collision Statement -> Date Overlap Detected (409 Conflict)', async () => {
    // Different content, but covers overlapping period 2026-10-01 to 2026-10-31
    const collidingPdfBuf = createSamplePdfBuffer({
      period: '2026-10-01 to 2026-10-31',
      openingBalance: '$50,000.00',
      closingBalance: '$51,000.00',
      lines: [{ date: '2026-10-18', description: 'Late Wire Received', amount: '$1,000.00' }],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/banking/statements/upload')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        bankAccountId: tenantABankAccountId,
        fileName: 'Colliding_Period_Statement.pdf',
        mimeType: 'application/pdf',
        content: collidingPdfBuf.toString('base64'),
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already uploaded for this account');
  });

  it('Variation 5: Corrupt / Malformed PDF -> Non-Crash Resilience (400 Bad Request)', async () => {
    const corruptContent = Buffer.from('NOT_A_REAL_PDF_RANDOM_CORRUPT_BYTES').toString('base64');

    const res = await request(app.getHttpServer())
      .post('/api/v1/banking/statements/upload')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        bankAccountId: tenantABankAccountId,
        fileName: 'corrupt_statement.pdf',
        mimeType: 'application/pdf',
        content: corruptContent,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Missing %PDF- header');
  });

  it('Variation 6: Multi-Tenant Data Isolation (Tenant B Cannot Access Tenant A Data)', async () => {
    const ts = Date.now();
    // Register Tenant B
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `intruder_${ts}@outsidecorp.com`,
        password: 'Password123!Secure',
        fullName: 'Mallory Outside',
      })
      .expect(201);

    tenantBToken = regRes.body.data.tokens.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tenantBToken}`)
      .send({
        legalName: `Outside Corp ${ts}`,
        slug: `outside-${ts}`,
        baseCurrency: 'USD',
        timezone: 'UTC',
      })
      .expect(201);

    tenantBId = orgRes.body.data.id;

    // Tenant B attempts to query Tenant A's bank statements
    const attemptRes = await request(app.getHttpServer())
      .get(`/api/v1/banking/statements?bankAccountId=${tenantABankAccountId}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .set('x-tenant-id', tenantBId)
      .expect(200);

    // Tenant B must get empty array — ZERO data leakage
    expect(attemptRes.body.data).toHaveLength(0);

    // Tenant B attempts to query Tenant A's transactions
    const txAttempt = await request(app.getHttpServer())
      .get(`/api/v1/banking/transactions?bankAccountId=${tenantABankAccountId}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .set('x-tenant-id', tenantBId)
      .expect(200);

    expect(txAttempt.body.data).toHaveLength(0);
  });
});
