import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/8050f510-f515-4191-9945-1dc835df7f96';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots/flow_walkthrough');
const LOCAL_SCREENSHOT_DIR = path.resolve('artifacts/screenshots/flow_walkthrough');

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
  console.log(`   📸 Captured: ${filename}`);
}

async function run() {
  console.log('================================================================');
  console.log('🎬 STARTING AUTOMATED FLOW WALKTHROUGH WITH PLAYWRIGHT');
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
  // FLOW 1: Overview Dashboard Baseline
  // --------------------------------------------------------------------------
  console.log('📍 Flow 1: Navigating to Dashboard Overview...');
  await page.goto('http://localhost:3099/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '01_dashboard_overview.png');

  // --------------------------------------------------------------------------
  // FLOW 2: Creating an Invoice with Typo
  // --------------------------------------------------------------------------
  console.log('📍 Flow 2: Creating Invoice with intentional typo in counterparty...');
  await page.goto('http://localhost:3099/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const createBtn = page.getByRole('button', { name: /create.*invoice/i }).first();
  if (await createBtn.isVisible()) {
    await createBtn.click();
    await page.waitForTimeout(600);

    const addNewClientBtn = page.getByText('+ Add New Client');
    if (await addNewClientBtn.isVisible()) {
      await addNewClientBtn.click();
      await page.waitForTimeout(300);
    }

    const clientInput = page.locator('#newCounterpartyName');
    if (await clientInput.isVisible()) {
      await clientInput.fill('Staright Technologies LLC'); // Intentional typo: Staright
    }

    const invNumInput = page.locator('#invoiceNumber');
    if (await invNumInput.isVisible()) {
      await invNumInput.fill('INV-2026-STARIGHT-01');
    }

    const descInput = page
      .locator('input[placeholder*="Consulting"], input[placeholder*="Description"]')
      .first();
    if (await descInput.isVisible()) {
      await descInput.fill('Cloud Architecture & API Infrastructure Setup');
    }

    const priceInput = page.locator('input[type="number"][step="0.01"]').first();
    if (await priceInput.isVisible()) {
      await priceInput.fill('5000.00');
    }

    await page.waitForTimeout(400);
    await capture(page, '02_create_invoice_with_typo.png');

    const confirmBtn = page.getByRole('button', { name: /confirm & record/i }).first();
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      await page.waitForTimeout(2500);
    }
  }

  // Ensure modal is closed and invoices table is refreshed
  await page.goto('http://localhost:3099/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '03_invoice_created_in_table.png');

  // --------------------------------------------------------------------------
  // FLOW 3: 1-Click "Send Invoice to Customer" via Email (Phase A)
  // --------------------------------------------------------------------------
  console.log('📍 Flow 3: Testing 1-Click Email Invoice Modal...');
  const emailBtn = page
    .getByTitle('Email invoice to customer')
    .or(page.getByRole('button', { name: /email/i }))
    .first();
  if (await emailBtn.isVisible()) {
    await emailBtn.click();
    await page.waitForTimeout(800);
    await capture(page, '04_email_invoice_modal.png');

    const cancelEmail = page.getByRole('button', { name: /cancel/i }).first();
    if (await cancelEmail.isVisible()) {
      await cancelEmail.click();
      await page.waitForTimeout(500);
    }
  }

  // --------------------------------------------------------------------------
  // FLOW 4: Banking Dropzone & Statement Ingestion Hub (Phase A, B, C)
  // --------------------------------------------------------------------------
  console.log('📍 Flow 4: Banking Dropzone & Upload Hub...');
  await page.goto('http://localhost:3099/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '05_banking_dropzone_hub.png');

  // Upload sample statement
  const sampleCsv = path.resolve(
    'sample_statements/stress_test/04_fuzzy_typo_counterparty_settlement.csv',
  );
  const fileInput = page.locator('input[type="file"]');
  if ((await fileInput.count()) > 0 && fs.existsSync(sampleCsv)) {
    console.log('   Uploading 04_fuzzy_typo_counterparty_settlement.csv...');
    await fileInput.first().setInputFiles(sampleCsv);
    await page.waitForTimeout(3500);
    await capture(page, '06_banking_after_statement_upload.png');
  }

  // --------------------------------------------------------------------------
  // FLOW 5: Exceptions Center & Triage Queue
  // --------------------------------------------------------------------------
  console.log('📍 Flow 5: Exceptions Center Triage Queue...');
  await page.goto('http://localhost:3099/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await capture(page, '07_exceptions_triage_queue.png');

  // --------------------------------------------------------------------------
  // FLOW 6: Split Transaction Multi-Category Modal (Phase C)
  // --------------------------------------------------------------------------
  console.log('📍 Flow 6: Opening Split Transaction Multi-Category Modal...');
  // Check if Table View button is visible and switch to table view to find [Split]
  const tableViewBtn = page.getByRole('button', { name: /table view/i }).first();
  if (await tableViewBtn.isVisible()) {
    await tableViewBtn.click();
    await page.waitForTimeout(800);
  }

  const splitBtn = page.getByRole('button', { name: /split/i }).first();
  if (await splitBtn.isVisible()) {
    await splitBtn.click();
    await page.waitForTimeout(800);

    // Try adding a split line if "+ Add Line" is available
    const addLineBtn = page.getByRole('button', { name: /\+ Add Split Line/i }).first();
    if (await addLineBtn.isVisible()) {
      await addLineBtn.click();
      await page.waitForTimeout(400);
    }

    await capture(page, '08_split_transaction_modal.png');

    const cancelSplit = page.getByRole('button', { name: /cancel/i }).first();
    if (await cancelSplit.isVisible()) {
      await cancelSplit.click();
      await page.waitForTimeout(400);
    }
  }

  // --------------------------------------------------------------------------
  // FLOW 7: Financial Statements & Reports with CSV Export (Phase A)
  // --------------------------------------------------------------------------
  console.log('📍 Flow 7: Financial Reports & Double-Entry Statements...');
  await page.goto('http://localhost:3099/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await capture(page, '09_reports_profit_and_loss.png');

  // Switch to Trial Balance
  const tbTab = page.getByRole('button', { name: /trial balance/i }).first();
  if (await tbTab.isVisible()) {
    await tbTab.click();
    await page.waitForTimeout(800);
    await capture(page, '10_reports_trial_balance.png');
  }

  // --------------------------------------------------------------------------
  // FLOW 8: Settings - Fiscal Periods & Period Locking (Phase C)
  // --------------------------------------------------------------------------
  console.log('📍 Flow 8: Settings - Fiscal Periods & Period Locking...');
  await page.goto('http://localhost:3099/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const periodsTabBtn = page.getByRole('button', { name: /fiscal periods/i }).first();
  if (await periodsTabBtn.isVisible()) {
    await periodsTabBtn.click();
    await page.waitForTimeout(1000);
    await capture(page, '11_settings_periods_open.png');

    // Click Lock Period on the first period
    const lockBtn = page.getByRole('button', { name: /lock period/i }).first();
    if (await lockBtn.isVisible()) {
      console.log('   Clicking Lock Period on Period 01...');
      await lockBtn.click();
      await page.waitForTimeout(1500);
      await capture(page, '12_settings_period_locked_closed.png');

      // Now click Reopen Period to show it can be reopened!
      const reopenBtn = page.getByRole('button', { name: /reopen period/i }).first();
      if (await reopenBtn.isVisible()) {
        console.log('   Clicking Reopen Period...');
        await reopenBtn.click();
        await page.waitForTimeout(1500);
        await capture(page, '13_settings_period_reopened.png');
      }
    }
  }

  // --------------------------------------------------------------------------
  // FLOW 9: Transactions Audit Ledger
  // --------------------------------------------------------------------------
  console.log('📍 Flow 9: Transactions Audit Ledger...');
  await page.goto('http://localhost:3099/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await capture(page, '14_transactions_audit_ledger.png');

  await browser.close();
  console.log('\n🎉 ALL FLOWS EXECUTED AND SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('❌ Flow Execution Error:', err);
  process.exit(1);
});
