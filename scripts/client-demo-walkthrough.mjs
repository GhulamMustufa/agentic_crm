import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = '/Users/mac/.gemini/antigravity-ide/brain/1f4866b9-99df-4151-b65c-f9934b3d25e1/screenshots';
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
  console.log('🚀 Starting Comprehensive Client Walkthrough & Recording...');
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

  // =========================================================================
  // STEP 1: Baseline Clean State (Dashboard & Reports)
  // =========================================================================
  console.log('📸 1. Capturing Baseline Overview (Clean state)...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_01_dashboard_clean.png') });
  console.log('   Saved client_01_dashboard_clean.png');

  console.log('📸 2. Capturing Baseline Financial Reports (All $0 balances)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_02_reports_clean.png') });
  console.log('   Saved client_02_reports_clean.png');

  // =========================================================================
  // STEP 2: Invoices Page & Create Invoice Modal
  // =========================================================================
  console.log('📸 3. Navigating to /invoices...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_03_invoices_page_clean.png') });
  console.log('   Saved client_03_invoices_page_clean.png');

  console.log('📸 4. Opening Create Invoice Modal in Quick 1-Line Mode...');
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
    await clientInput.fill('Starlight Client Corp');
  }

  const invNumInput = page.locator('#invoiceNumber');
  await invNumInput.fill('INV-2026-STARLIGHT');

  const issueDateInput = page.locator('#issueDate');
  await issueDateInput.fill('2026-10-01');

  const dueDateInput = page.locator('#dueDate');
  await dueDateInput.fill('2026-10-31');

  // First line item description and amount
  const descInput = page.locator('input[placeholder*="Consulting"], input[placeholder*="Description"]').first();
  if (await descInput.isVisible()) {
    await descInput.fill('Enterprise Architecture & Implementation Services');
  }

  const priceInput = page.locator('input[type="number"][step="0.01"]').first();
  if (await priceInput.isVisible()) {
    await priceInput.fill('30000');
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_04_create_invoice_modal.png') });
  console.log('   Saved client_04_create_invoice_modal.png');

  // Post invoice directly to General Ledger
  console.log('📍 Clicking "Post to Ledger"...');
  const postBtn = page.getByRole('button', { name: /post to ledger/i }).first();
  await postBtn.click();
  await page.waitForTimeout(3000);

  console.log('📸 5. Capturing posted invoice list...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_05_invoice_posted.png') });
  console.log('   Saved client_05_invoice_posted.png');

  // =========================================================================
  // STEP 3: Financial Reports After Invoicing (AR Debited, Revenue Credited)
  // =========================================================================
  console.log('📸 6. Checking /reports after invoice posted...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_06_reports_after_invoice.png') });
  console.log('   Saved client_06_reports_after_invoice.png');

  // =========================================================================
  // STEP 4: Banking Statement Upload (Mercury Bank - $30k deposit matches invoice)
  // =========================================================================
  console.log('📸 7. Navigating to /banking...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Select Mercury Commercial Checking account
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

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_07_banking_page.png') });
  console.log('   Saved client_07_banking_page.png');

  console.log('📤 Uploading variation_1_clean_standard_mercury.pdf...');
  const samplePdf1 = path.resolve('sample_statements/variation_1_clean_standard_mercury.pdf');
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.count() > 0) {
    await fileInput.first().setInputFiles(samplePdf1);
    await page.waitForTimeout(5000);
  }

  console.log('📸 8. Capturing banking page after statement ingestion...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_08_banking_after_upload.png') });
  console.log('   Saved client_08_banking_after_upload.png');

  // =========================================================================
  // STEP 5: Live Transactions & Match Proposals
  // =========================================================================
  console.log('📸 9. Navigating to /transactions...');
  await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_09_transactions_matched.png') });
  console.log('   Saved client_09_transactions_matched.png');

  // =========================================================================
  // STEP 6: Invoice Automatically Reconciled & Marked "PAID"
  // =========================================================================
  console.log('📸 10. Navigating back to /invoices to verify PAID status...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_10_invoice_marked_paid.png') });
  console.log('   Saved client_10_invoice_marked_paid.png');

  // =========================================================================
  // STEP 7: Upload Statement with Ambiguous Items (Exceptions Routing)
  // =========================================================================
  console.log('📤 Navigating to /banking to upload variation_2_exception_vendor_unmapped.pdf...');
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
    await page.waitForTimeout(5000);
  }

  console.log('📸 11. Navigating to /exceptions...');
  await page.goto('http://localhost:3000/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_11_exceptions_center.png') });
  console.log('   Saved client_11_exceptions_center.png');

  // =========================================================================
  // STEP 8: Final Truth on Reports (Income Statement & Balance Sheet)
  // =========================================================================
  console.log('📸 12. Capturing Final Financial Reports...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'client_12_final_reports.png') });
  console.log('   Saved client_12_final_reports.png');

  await browser.close();
  console.log('🎉 Comprehensive Walkthrough Completed Successfully!');
}

run().catch((err) => {
  console.error('❌ Walkthrough Error:', err);
  process.exit(1);
});
