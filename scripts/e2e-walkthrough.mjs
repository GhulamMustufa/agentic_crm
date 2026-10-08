import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('artifacts/screenshots');
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
  console.log('🚀 Starting Automated Playwright Walkthrough...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 850 },
    locale: 'en-US',
  });

  // Inject cookies
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

  // Inject localStorage on initialization
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('agentic_os_token', token);
      localStorage.setItem('agentic_os_user', JSON.stringify(user));
      localStorage.setItem('agentic_os_tenant_id', user.tenantId);
    },
    { token, user },
  );

  // --- Step 1: Invoices Initial View ---
  console.log('📍 1. Navigating to /invoices...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_invoices_initial.png') });
  console.log('📸 Captured 01_invoices_initial.png');

  // --- Step 2: Open Create Invoice Modal ---
  console.log('📍 2. Opening Create Invoice Modal...');
  const createBtn = page.getByRole('button', { name: /create.*invoice/i }).first();
  await createBtn.click();
  await page.waitForTimeout(500);

  // Switch to new client mode if available
  const addNewClientBtn = page.getByText('+ Add New Client');
  if (await addNewClientBtn.isVisible()) {
    await addNewClientBtn.click();
    await page.waitForTimeout(300);
  }

  const clientInput = page.locator('#newCounterpartyName');
  if (await clientInput.isVisible()) {
    await clientInput.fill('Starlight Client');
  }

  const invNumInput = page.locator('#invoiceNumber');
  await invNumInput.fill('INV-2026-STARLIGHT');

  const issueDateInput = page.locator('#issueDate');
  await issueDateInput.fill('2026-10-01');

  const dueDateInput = page.locator('#dueDate');
  await dueDateInput.fill('2026-10-31');

  // First line item description and price
  const descInput = page.locator('input[placeholder*="Consulting"], input[placeholder*="Description"]').first();
  if (await descInput.isVisible()) {
    await descInput.fill('Enterprise Architecture & Implementation');
  }

  const priceInput = page.locator('input[type="number"][step="0.01"]').first();
  if (await priceInput.isVisible()) {
    await priceInput.fill('30000');
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_create_invoice_modal.png') });
  console.log('📸 Captured 02_create_invoice_modal.png');

  // Submit invoice
  console.log('📍 Submitting invoice...');
  const submitBtn = page.locator('#invoice-modal-form button[type="submit"]');
  await submitBtn.click();
  await page.waitForTimeout(2500);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_invoice_posted_table.png') });
  console.log('📸 Captured 03_invoice_posted_table.png');

  // --- Step 3: Reports (Before Payment) ---
  console.log('📍 3. Navigating to /reports (Before Payment)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_reports_before_payment.png') });
  console.log('📸 Captured 04_reports_before_payment.png');

  // --- Step 4: Banking Page ---
  console.log('📍 4. Navigating to /banking...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_banking_page.png') });
  console.log('📸 Captured 05_banking_page.png');

  // --- Step 5: Upload Clean Statement (Variation 1) ---
  console.log('📍 5. Uploading variation_1_clean_standard_mercury.pdf...');
  const samplePdf1 = path.resolve('sample_statements/variation_1_clean_standard_mercury.pdf');
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.count() > 0) {
    await fileInput.first().setInputFiles(samplePdf1);
    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_banking_after_upload.png') });
  console.log('📸 Captured 06_banking_after_upload.png');

  // --- Step 6: Transactions Screen ---
  console.log('📍 6. Navigating to /transactions...');
  await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_transactions_list.png') });
  console.log('📸 Captured 07_transactions_list.png');

  // --- Step 7: Invoices Screen (After Statement Processing) ---
  console.log('📍 7. Navigating back to /invoices to see updated status...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_invoices_after_statement.png') });
  console.log('📸 Captured 08_invoices_after_statement.png');

  // --- Step 8: Upload Exception Statement (Variation 2) ---
  console.log('📍 8. Navigating to /banking and uploading variation_2_exception_vendor_unmapped.pdf...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const samplePdf2 = path.resolve('sample_statements/variation_2_exception_vendor_unmapped.pdf');
  if (await fileInput.count() > 0) {
    await fileInput.first().setInputFiles(samplePdf2);
    await page.waitForTimeout(4000);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_exception_statement_uploaded.png') });
  console.log('📸 Captured 09_exception_statement_uploaded.png');

  // --- Step 9: Exceptions Screen ---
  console.log('📍 9. Navigating to /exceptions...');
  await page.goto('http://localhost:3000/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_exceptions_screen.png') });
  console.log('📸 Captured 10_exceptions_screen.png');

  // --- Step 10: Reports Screen Final ---
  console.log('📍 10. Navigating to /reports (Final Truth)...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_final_reports.png') });
  console.log('📸 Captured 11_final_reports.png');

  await browser.close();
  console.log('✅ Automated Walkthrough Completed Successfully!');
}

run().catch((err) => {
  console.error('❌ Walkthrough Error:', err);
  process.exit(1);
});
