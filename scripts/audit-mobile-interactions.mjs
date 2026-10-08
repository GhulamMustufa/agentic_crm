import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/8050f510-f515-4191-9945-1dc835df7f96';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots/mobile');

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
  console.log('📱 Testing Mobile Interaction Flows (390x844)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
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

  // 1. Exceptions Page: Click first exception to see Master-Detail behavior on mobile!
  console.log('📸 Navigating to /exceptions and selecting item on mobile...');
  await page.goto('http://localhost:3000/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const firstItem = page.locator('div[role="button"], .cursor-pointer').filter({ hasText: 'Muhammad Hafiz' }).first();
  if (await firstItem.isVisible()) {
    await firstItem.click();
    await page.waitForTimeout(800);
    const excDetailShot = path.join(SCREENSHOT_DIR, 'mobile_exceptions_detail_view.png');
    await page.screenshot({ path: excDetailShot, fullPage: true });
    console.log(`✅ Saved: ${excDetailShot}`);
  }

  // 2. Invoices Page: Click Create Invoice modal on mobile!
  console.log('📸 Navigating to /invoices and opening modal on mobile...');
  await page.goto('http://localhost:3000/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const createInvBtn = page.getByRole('button', { name: /create invoice/i }).first();
  if (await createInvBtn.isVisible()) {
    await createInvBtn.click();
    await page.waitForTimeout(800);
    const invModalShot = path.join(SCREENSHOT_DIR, 'mobile_invoices_modal.png');
    await page.screenshot({ path: invModalShot, fullPage: true });
    console.log(`✅ Saved: ${invModalShot}`);
  }

  // 3. Transactions Page: Check table rendering on mobile!
  console.log('📸 Navigating to /transactions on mobile...');
  await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // Scroll down to see table
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(500);
  const txTableShot = path.join(SCREENSHOT_DIR, 'mobile_transactions_table.png');
  await page.screenshot({ path: txTableShot, fullPage: false });
  console.log(`✅ Saved: ${txTableShot}`);

  await browser.close();
  console.log('🎉 Mobile interactions test complete!');
}

run().catch((err) => {
  console.error('❌ Error during mobile interactions test:', err);
  process.exit(1);
});
