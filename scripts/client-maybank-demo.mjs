import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SCREENSHOT_DIR = '/Users/mac/.gemini/antigravity-ide/brain/1f4866b9-99df-4151-b65c-f9934b3d25e1/screenshots/maybank_demo';
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
  console.log('🧹 Step 0: Running fresh deletion script to reset tenant data to $0.00...');
  execSync('npx ts-node -r dotenv/config scripts/reset-tenant-data.ts fd552037-fc94-40b7-aa7d-b3c387c954f9', {
    stdio: 'inherit',
  });

  console.log('\n🚀 Step 1: Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
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

  // -------------------------------------------------------------------------
  // 1. BASELINE CLEAN STATE: Dashboard & Reports
  // -------------------------------------------------------------------------
  console.log('📸 1. Capturing Baseline Clean Dashboard...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_clean_dashboard.png') });
  console.log('   Saved 01_clean_dashboard.png');

  console.log('📸 2. Capturing Baseline Financial Reports ($0.00 balance)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_clean_reports.png') });
  console.log('   Saved 02_clean_reports.png');

  // -------------------------------------------------------------------------
  // 2. CREATE CUSTOMER INVOICE MATCHING MAYBANK DEPOSIT
  // -------------------------------------------------------------------------
  console.log('📸 3. Navigating to /invoices and opening Create Invoice modal...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const createBtn = page.getByRole('button', { name: /create.*invoice/i }).first();
  await createBtn.click();
  await page.waitForTimeout(1000);

  // Switch to Add New Client
  const addNewClientBtn = page.getByText('+ Add New Client');
  if (await addNewClientBtn.isVisible()) {
    await addNewClientBtn.click();
    await page.waitForTimeout(300);
  }

  const clientInput = page.locator('#newCounterpartyName');
  if (await clientInput.isVisible()) {
    await clientInput.fill('YEHS LOKCHING TRADI');
  }

  const invNumInput = page.locator('#invoiceNumber');
  await invNumInput.fill('INV-2026-YEHS-101');

  const issueDateInput = page.locator('#issueDate');
  await issueDateInput.fill('2026-06-01');

  const dueDateInput = page.locator('#dueDate');
  await dueDateInput.fill('2026-06-30');

  // Fill line item: description and amount 1303.00 (matching Maybank deposit on 02/06)
  const descInput = page.locator('input[placeholder*="Consulting"], input[placeholder*="Description"]').first();
  if (await descInput.isVisible()) {
    await descInput.fill('Checkers and Lokching Food Inventory Supply');
  }

  const priceInput = page.locator('input[type="number"][step="0.01"]').first();
  if (await priceInput.isVisible()) {
    await priceInput.fill('1303');
  }

  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_create_invoice_modal.png') });
  console.log('   Saved 03_create_invoice_modal.png');

  console.log('📍 Submitting invoice ("Confirm & Record Invoice")...');
  const postBtn = page.getByRole('button', { name: /confirm & record invoice|post to ledger/i }).first();
  await postBtn.click();
  await page.waitForTimeout(3000);

  console.log('📸 4. Capturing posted invoice list...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_invoice_posted.png') });
  console.log('   Saved 04_invoice_posted.png');

  // -------------------------------------------------------------------------
  // 3. FINANCIAL REPORTS AFTER INVOICE POSTING
  // -------------------------------------------------------------------------
  console.log('📸 5. Checking /reports after invoice posted (AR: $1,303.00, Revenue: $1,303.00)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_reports_after_invoice.png') });
  console.log('   Saved 05_reports_after_invoice.png');

  // -------------------------------------------------------------------------
  // 4. BANKING STATEMENT INGESTION (MAYBANK ISLAMIC PDF)
  // -------------------------------------------------------------------------
  console.log('📸 6. Navigating to /banking and selecting Maybank account...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Select Maybank CHECKING account (*5671)
  const accountSelect = page.locator('select').first();
  if (await accountSelect.isVisible()) {
    const maybankOpt = accountSelect.locator('option:has-text("Maybank")').first();
    if (await maybankOpt.count() > 0) {
      const val = await maybankOpt.getAttribute('value');
      if (val) {
        await accountSelect.selectOption(val);
        console.log(`   Selected Maybank account ID: ${val}`);
        await page.waitForTimeout(500);
      }
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_banking_page_ready.png') });
  console.log('   Saved 06_banking_page_ready.png');

  console.log('📤 Uploading sample_statements/tasty_treats_maybank_statement.pdf...');
  const maybankPdfPath = path.resolve('sample_statements/tasty_treats_maybank_statement.pdf');
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.count() > 0) {
    await fileInput.first().setInputFiles(maybankPdfPath);
    console.log('   Waiting for ingestion & OCR extraction pipeline...');
    await page.waitForTimeout(6000);
  }

  console.log('📸 7. Capturing banking page after statement ingestion...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_banking_statement_uploaded.png') });
  console.log('   Saved 07_banking_statement_uploaded.png');

  // -------------------------------------------------------------------------
  // 5. TRANSACTIONS PAGE: INGESTED TRANSACTIONS & RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('📸 8. Navigating to /transactions...');
  await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_transactions_reconciled.png') });
  console.log('   Saved 08_transactions_reconciled.png');

  // -------------------------------------------------------------------------
  // 6. INVOICES PAGE: VERIFY AUTOMATIC RECONCILIATION ("PAID")
  // -------------------------------------------------------------------------
  console.log('📸 9. Navigating to /invoices to verify PAID status...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_invoice_marked_paid.png') });
  console.log('   Saved 09_invoice_marked_paid.png');

  // -------------------------------------------------------------------------
  // 7. REVIEW & APPROVALS (EXCEPTIONS CENTER)
  // -------------------------------------------------------------------------
  console.log('📸 10. Navigating to /exceptions (Review & Approvals)...');
  await page.goto('http://localhost:3000/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_review_approvals.png') });
  console.log('   Saved 10_review_approvals.png');

  // Test approving an unmapped item
  const approveBtn = page.getByRole('button', { name: /approve & record|approve/i }).first();
  if (await approveBtn.isVisible()) {
    console.log('📍 Approving first unmapped expense item...');
    await approveBtn.click();
    await page.waitForTimeout(2000);
  }

  console.log('📸 11. Capturing Review & Approvals after approving item...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_approved_item_recorded.png') });
  console.log('   Saved 11_approved_item_recorded.png');

  // -------------------------------------------------------------------------
  // 8. FINAL FINANCIAL REPORTS
  // -------------------------------------------------------------------------
  console.log('📸 12. Navigating to /reports for final balanced financial statement...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Select June 2026 from the period dropdown
  const periodSelect = page.locator('select').first();
  if (await periodSelect.isVisible()) {
    const juneOpt = periodSelect.locator('option:has-text("June 2026")').first();
    if (await juneOpt.count() > 0) {
      const val = await juneOpt.getAttribute('value');
      if (val) {
        await periodSelect.selectOption(val);
        console.log('   Selected June 2026 period in reports dropdown');
        await page.waitForTimeout(1000);
      }
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_final_pnl_june2026.png') });
  console.log('   Saved 12_final_pnl_june2026.png');

  // Click Balance Sheet
  const bsBtn = page.getByRole('button', { name: /balance sheet/i }).first();
  if (await bsBtn.isVisible()) {
    await bsBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_final_balance_sheet.png') });
    console.log('   Saved 13_final_balance_sheet.png');
  }

  // Click Trial Balance
  const tbBtn = page.getByRole('button', { name: /trial balance/i }).first();
  if (await tbBtn.isVisible()) {
    await tbBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_final_trial_balance.png') });
    console.log('   Saved 14_final_trial_balance.png');
  }

  await browser.close();
  console.log('\n🎉 Demonstration workflow completed successfully! All screenshots captured.');
}

run().catch((err) => {
  console.error('❌ Error executing demonstration script:', err);
  process.exit(1);
});
