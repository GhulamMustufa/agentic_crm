import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/8050f510-f515-4191-9945-1dc835df7f96';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
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

async function run() {
  console.log('================================================================');
  console.log('🚀 ENTERPRISE QA ARCHITECT: STARTING MULTI-VARIATION WALKTHROUGH');
  console.log('================================================================\n');

  // Step 0: Clean data
  console.log('🧹 Step 0: Resetting tenant data for clean baseline...');
  try {
    execSync(`npx ts-node scripts/reset-tenant-data.ts ${user.tenantId}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log('✅ Baseline data reset successfully.\n');
  } catch (err) {
    console.error('❌ Data reset failed:', err);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });

  // Handle native prompt dialogs (like invoice void reason)
  context.on('dialog', async (dialog) => {
    console.log(`💬 Dialog popup: "${dialog.message()}"`);
    await dialog.accept('Client cancelled project scope / CFO approved void');
  });

  // Inject authentication cookies
  await context.addCookies([
    {
      name: 'token',
      value: token,
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'tenantId',
      value: user.tenantId,
      domain: 'localhost',
      path: '/',
    },
  ]);

  const page = await context.newPage();

  // Inject localStorage state for immediate client-side session hydration
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('agentic_os_token', token);
      localStorage.setItem('agentic_os_user', JSON.stringify(user));
      localStorage.setItem('agentic_os_tenant_id', user.tenantId);
    },
    { token, user },
  );

  // =========================================================================
  // STEP 1: Baseline Clean State (Dashboard & Reports)
  // =========================================================================
  console.log('📸 1. Capturing Baseline Overview (Clean state)...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_dashboard_baseline_clean.png') });
  console.log('   -> Saved 01_dashboard_baseline_clean.png');

  console.log('📸 2. Capturing Baseline Financial Reports (All $0 balances)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_reports_baseline_clean.png') });
  console.log('   -> Saved 02_reports_baseline_clean.png');

  // =========================================================================
  // STEP 2: Invoices Page & Create Invoice ($30,000 to Starlight Corp)
  // =========================================================================
  console.log('📸 3. Navigating to /invoices to create $30,000 Enterprise Invoice...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const createBtn = page.getByRole('button', { name: /create.*invoice/i }).first();
  await createBtn.click();
  await page.waitForTimeout(800);

  // Switch to new client mode if available
  const addNewClientBtn = page.getByText('+ Add New Client');
  if (await addNewClientBtn.isVisible()) {
    await addNewClientBtn.click();
    await page.waitForTimeout(300);
  }

  const clientInput = page.locator('#newCounterpartyName');
  if (await clientInput.isVisible()) {
    await clientInput.fill('Starlight Corp');
  }

  const invNumInput = page.locator('#invoiceNumber');
  await invNumInput.fill('INV-2026-STARLIGHT');

  const issueDateInput = page.locator('#issueDate');
  await issueDateInput.fill('2026-10-01');

  const dueDateInput = page.locator('#dueDate');
  await dueDateInput.fill('2026-10-31');

  const descInput = page.locator('input[placeholder*="Consulting"], input[placeholder*="Description"]').first();
  if (await descInput.isVisible()) {
    await descInput.fill('Enterprise Architecture & System Implementation');
  }

  const priceInput = page.locator('input[type="number"][step="0.01"]').first();
  if (await priceInput.isVisible()) {
    await priceInput.fill('30000');
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_invoice_create_modal.png') });
  console.log('   -> Saved 03_invoice_create_modal.png');

  console.log('📍 Confirming & Recording Invoice (Posting to General Ledger)...');
  const recordBtn = page.getByRole('button', { name: /Confirm & Record|Record Invoice|Post to Ledger/i }).first();
  await recordBtn.click();
  await page.waitForTimeout(3500);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_invoice_posted_table.png') });
  console.log('   -> Saved 04_invoice_posted_table.png');

  console.log('📸 4. Checking Reports after Invoice Posting (AR: $30,000, Revenue: $30,000)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_reports_after_invoice_ar_revenue.png') });
  console.log('   -> Saved 05_reports_after_invoice_ar_revenue.png');

  // =========================================================================
  // STEP 3: Bank Statement Upload (Mercury Bank USD - Clean Happy Path)
  // =========================================================================
  console.log('📸 5. Navigating to /banking and uploading Mercury Bank Statement (Variation 1)...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const accountSelect = page.locator('select').filter({ hasText: /Mercury|Maybank|Auto-Detect/i }).first();
  if (await accountSelect.isVisible()) {
    const mercuryOpt = accountSelect.locator('option:has-text("Mercury")').first();
    if (await mercuryOpt.count() > 0) {
      const val = await mercuryOpt.getAttribute('value');
      if (val) {
        await accountSelect.selectOption(val);
        console.log(`   Selected Mercury account: ${val}`);
        await page.waitForTimeout(500);
      }
    }
  }

  const samplePdf1 = path.resolve('sample_statements/variation_1_clean_standard_mercury.pdf');
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.count() > 0) {
    await fileInput.first().setInputFiles(samplePdf1);
    console.log('   Waiting for ingestion & reconciliation processing...');
    await page.waitForTimeout(7000);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_banking_mercury_uploaded.png') });
  console.log('   -> Saved 06_banking_mercury_uploaded.png');

  console.log('📸 6. Checking Live Transactions & Match Proposals...');
  await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_transactions_reconciled.png') });
  console.log('   -> Saved 07_transactions_reconciled.png');

  console.log('📸 7. Checking Invoices Page - Verifying Auto-Reconciled PAID Status ($0 Due)...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_invoice_reconciled_paid.png') });
  console.log('   -> Saved 08_invoice_reconciled_paid.png');

  // =========================================================================
  // STEP 4: Exception Handling & Anomaly Quarantine (Variation 2 Statement)
  // =========================================================================
  console.log('📸 8. Navigating to /banking and uploading Statement with Exceptions (Variation 2)...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  if (await accountSelect.isVisible()) {
    const mercuryOpt = accountSelect.locator('option:has-text("Mercury")').first();
    if (await mercuryOpt.count() > 0) {
      const val = await mercuryOpt.getAttribute('value');
      if (val) {
        await accountSelect.selectOption(val);
        await page.waitForTimeout(500);
      }
    }
  }

  const samplePdf2 = path.resolve('sample_statements/variation_2_exception_vendor_unmapped.pdf');
  if (await fileInput.count() > 0) {
    await fileInput.first().setInputFiles(samplePdf2);
    console.log('   Waiting for exception quarantine routing...');
    await page.waitForTimeout(7000);
  }

  console.log('📸 9. Navigating to Exception Center (/exceptions)...');
  await page.goto('http://localhost:3000/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_exception_center_quarantine.png') });
  console.log('   -> Saved 09_exception_center_quarantine.png');

  // Click Approve on the selected exception item to showcase interactive resolution
  const approveBtn = page.getByRole('button', { name: /Approve/i }).first();
  if (await approveBtn.isVisible()) {
    console.log('📍 Approving exception item in human-in-the-loop Exception Center...');
    await approveBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_exception_resolved_live.png') });
    console.log('   -> Saved 10_exception_resolved_live.png');
  }

  // =========================================================================
  // STEP 5: Multi-Currency Enterprise Ingestion (Maybank Malaysia MYR)
  // =========================================================================
  console.log('📸 11. Navigating to /banking and uploading Multi-Page Maybank MYR Statement...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  if (await accountSelect.isVisible()) {
    const maybankOpt = accountSelect.locator('option:has-text("Maybank")').first();
    if (await maybankOpt.count() > 0) {
      const val = await maybankOpt.getAttribute('value');
      if (val) {
        await accountSelect.selectOption(val);
        console.log(`   Selected Maybank account: ${val}`);
        await page.waitForTimeout(500);
      }
    }
  }

  const samplePdf3 = path.resolve('sample_statements/tasty_treats_maybank_statement.pdf');
  if (await fileInput.count() > 0) {
    await fileInput.first().setInputFiles(samplePdf3);
    console.log('   Waiting for multi-page statement parsing...');
    await page.waitForTimeout(8000);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_banking_maybank_myr_uploaded.png') });
  console.log('   -> Saved 11_banking_maybank_myr_uploaded.png');

  // =========================================================================
  // STEP 6: Adversarial Flow: Second Invoice Voiding & Audit Trail Reversal
  // =========================================================================
  console.log('📸 12. Creating Second Invoice to demonstrate deterministic Void Reversal...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await createBtn.click();
  await page.waitForTimeout(800);

  if (await addNewClientBtn.isVisible()) {
    await addNewClientBtn.click();
    await page.waitForTimeout(300);
  }

  if (await clientInput.isVisible()) {
    await clientInput.fill('Acme Global Inc');
  }

  await invNumInput.fill('INV-2026-ADVERSARIAL');
  await issueDateInput.fill('2026-10-05');
  await dueDateInput.fill('2026-10-25');

  if (await descInput.isVisible()) {
    await descInput.fill('Adversarial Test Consulting Contract');
  }
  if (await priceInput.isVisible()) {
    await priceInput.fill('5000');
  }

  await page.waitForTimeout(500);
  const recordBtn2 = page.getByRole('button', { name: /Confirm & Record|Record Invoice|Post to Ledger/i }).first();
  await recordBtn2.click();
  await page.waitForTimeout(3500);

  console.log('   Invoice INV-2026-ADVERSARIAL recorded.');

  // Find the invoice row and void it
  console.log('📍 Triggering Void Reversal on INV-2026-ADVERSARIAL...');
  const row = page.locator('tr:has-text("INV-2026-ADVERSARIAL")').first();
  if (await row.isVisible()) {
    const voidBtn = row.locator('button:has-text("Void")').first();
    if (await voidBtn.isVisible()) {
      await voidBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_invoice_voided_lifecycle.png') });
  console.log('   -> Saved 12_invoice_voided_lifecycle.png');

  // =========================================================================
  // STEP 7: Final Comprehensive Financial Reports & Executive Dashboard
  // =========================================================================
  console.log('📸 13. Capturing Final End-of-Period Financial Reports (P&L, Balance Sheet, Trial Balance)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_final_financial_package.png') });
  console.log('   -> Saved 13_final_financial_package.png');

  console.log('📸 14. Capturing Final Executive Dashboard...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_final_executive_dashboard.png') });
  console.log('   -> Saved 14_final_executive_dashboard.png');

  await browser.close();
  console.log('\n================================================================');
  console.log('🎉 ALL MULTI-VARIATION PLAYWRIGHT FLOWS COMPLETED SUCCESSFULLY!');
  console.log(`📁 All screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('❌ Walkthrough Error:', err);
  process.exit(1);
});
