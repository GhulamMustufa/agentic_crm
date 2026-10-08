import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

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
  console.log('🚀 Launching Chromium to capture Phase 1 Invoices & Transactions UI...');
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

  // 1. Transactions Screen
  console.log('📸 Navigating to http://localhost:3000/transactions...');
  await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const txScreenshot = path.join(SCREENSHOT_DIR, 'phase1_transactions_clean_payees.png');
  await page.screenshot({ path: txScreenshot });
  console.log(`✅ Saved Transactions screenshot: ${txScreenshot}`);

  // 2. Invoices Screen
  console.log('📸 Navigating to http://localhost:3000/invoices...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const invScreenshot = path.join(SCREENSHOT_DIR, 'phase1_invoices_table.png');
  await page.screenshot({ path: invScreenshot });
  console.log(`✅ Saved Invoices screenshot: ${invScreenshot}`);

  // 3. Open Invoices Create Modal to show Customer/Vendor switcher
  console.log('📸 Opening Invoice Create Modal...');
  const createBtn = page.getByRole('button', { name: /create.*invoice/i }).first();
  if (await createBtn.isVisible()) {
    await createBtn.click();
    await page.waitForTimeout(800);
    const modalScreenshot = path.join(SCREENSHOT_DIR, 'phase1_invoices_modal.png');
    await page.screenshot({ path: modalScreenshot });
    console.log(`✅ Saved Invoices Modal screenshot: ${modalScreenshot}`);
  }

  await browser.close();
  console.log('🎉 Phase 1 verification complete!');
}

run().catch((err) => {
  console.error('❌ Error capturing screenshots:', err);
  process.exit(1);
});
