import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/8050f510-f515-4191-9945-1dc835df7f96';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots/e2e_scenarios');
const LOCAL_SCREENSHOT_DIR = path.resolve('artifacts/screenshots/e2e_scenarios');

for (const dir of [SCREENSHOT_DIR, LOCAL_SCREENSHOT_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const secret = process.env.JWT_SECRET || 'development_jwt_secret_must_be_overridden_in_prod';
const user = {
  id: '1678a13b-c6d0-4dd9-8f60-8897c1f9317e',
  email: 'ghulam1@gmail.com',
  fullName: 'ghulam1 mustafa1',
  tenantId: 'fd552037-fc94-40b7-aa7d-b3c387c954f9',
};

const token = jwt.sign(
  {
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
    roleCode: 'OWNER',
    type: 'access',
  },
  secret,
  { expiresIn: '7d' },
);

async function capture(page, filename) {
  const p1 = path.join(SCREENSHOT_DIR, filename);
  const p2 = path.join(LOCAL_SCREENSHOT_DIR, filename);
  await page.screenshot({ path: p1 });
  fs.copyFileSync(p1, p2);
  console.log(`   📸 Saved screenshot: ${filename}`);
}

async function run() {
  console.log('================================================================');
  console.log('🚀 STARTING PLAYWRIGHT E2E SCENARIO TESTING & SCREENSHOT CAPTURE');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });

  await context.addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
    { name: 'tenantId', value: user.tenantId, domain: 'localhost', path: '/' },
  ]);

  const page = await context.newPage();

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('agentic_os_token', token);
      localStorage.setItem('agentic_os_user', JSON.stringify(user));
      localStorage.setItem('agentic_os_tenant_id', user.tenantId);
    },
    { token, user },
  );

  // --------------------------------------------------------------------------
  // Scenario 1: Overview Dashboard
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 1: Overview Dashboard...');
  await page.goto('http://localhost:3099/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '01_dashboard_overview.png');

  // --------------------------------------------------------------------------
  // Scenario 2: Invoices Page & 1-Click Emailing Modal
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 2: Invoices Screen & Create Invoice...');
  await page.goto('http://localhost:3099/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '02_invoices_list_view.png');

  // Open Create Invoice modal
  const createInvBtn = page.getByRole('button', { name: /create.*invoice/i }).first();
  if (await createInvBtn.isVisible()) {
    await createInvBtn.click();
    await page.waitForTimeout(600);
    await capture(page, '03_create_invoice_modal.png');
    // Close modal
    const cancelBtn = page.getByRole('button', { name: /cancel/i }).first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.waitForTimeout(400);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Banking Statement Dropzone
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 3: Banking & Statement Ingestion Hub...');
  await page.goto('http://localhost:3099/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await capture(page, '04_banking_dropzone_hub.png');

  // --------------------------------------------------------------------------
  // Scenario 4: Exceptions Center & Triage
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 4: Exceptions Center...');
  await page.goto('http://localhost:3099/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await capture(page, '05_exceptions_triage_tray.png');

  // If a Split button exists on any row, open the Split Modal!
  const splitBtn = page.getByRole('button', { name: /split/i }).first();
  if (await splitBtn.isVisible()) {
    console.log('📍 Opening Split Transaction Multi-Category Modal...');
    await splitBtn.click();
    await page.waitForTimeout(800);
    await capture(page, '06_split_transaction_modal.png');
    const closeSplit = page.getByRole('button', { name: /cancel/i }).first();
    if (await closeSplit.isVisible()) {
      await closeSplit.click();
      await page.waitForTimeout(400);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Financial Reports & CSV Export
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 5: Financial Reports & Statements...');
  await page.goto('http://localhost:3099/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await capture(page, '07_financial_reports_pnl.png');

  // --------------------------------------------------------------------------
  // Scenario 6: Transactions Audit Ledger
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 6: Transactions Ledger...');
  await page.goto('http://localhost:3099/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '08_transactions_audit_ledger.png');

  // --------------------------------------------------------------------------
  // Scenario 7: Settings - AI Automation & Guardrails
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 7: Settings - AI Guardrails...');
  await page.goto('http://localhost:3099/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '09_settings_ai_guardrails.png');

  // --------------------------------------------------------------------------
  // Scenario 8: Settings - Fiscal Periods & Locks Tab
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 8: Settings - Fiscal Periods & Period Locking...');
  const periodsTabBtn = page.getByRole('button', { name: /fiscal periods/i }).first();
  if (await periodsTabBtn.isVisible()) {
    await periodsTabBtn.click();
    await page.waitForTimeout(1000);
    await capture(page, '10_settings_fiscal_periods_locking.png');
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Settings - Company Profile & Base Currency
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 9: Settings - Company Profile...');
  const orgTabBtn = page.getByRole('button', { name: /company profile/i }).first();
  if (await orgTabBtn.isVisible()) {
    await orgTabBtn.click();
    await page.waitForTimeout(800);
    await capture(page, '11_settings_company_profile.png');
  }

  // --------------------------------------------------------------------------
  // Scenario 10: Settings - Team & Roles
  // --------------------------------------------------------------------------
  console.log('📍 Scenario 10: Settings - Team & RBAC Roles...');
  const teamTabBtn = page.getByRole('button', { name: /team & roles/i }).first();
  if (await teamTabBtn.isVisible()) {
    await teamTabBtn.click();
    await page.waitForTimeout(800);
    await capture(page, '12_settings_team_roles.png');
  }

  await browser.close();
  console.log('\n✅ All 12 Scenario Screenshots Captured Successfully!');
}

run().catch((err) => {
  console.error('❌ Playwright Walkthrough Error:', err);
  process.exit(1);
});
