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
  console.log('🚀 Launching Chromium to capture Phase 2 Executive Dashboard & Banking UI...');
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

  // 1. Executive Dashboard Screen
  console.log('📸 Navigating to http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dashScreenshot = path.join(SCREENSHOT_DIR, 'phase2_dashboard_overview.png');
  await page.screenshot({ path: dashScreenshot });
  console.log(`✅ Saved Dashboard screenshot: ${dashScreenshot}`);

  // 2. Banking Screen
  console.log('📸 Navigating to http://localhost:3000/banking ...');
  await page.goto('http://localhost:3000/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bankingScreenshot = path.join(SCREENSHOT_DIR, 'phase2_banking_account_selector.png');
  await page.screenshot({ path: bankingScreenshot });
  console.log(`✅ Saved Banking screenshot: ${bankingScreenshot}`);

  // 3. Banking Screen with Add Account opened
  console.log('📸 Opening Connect Bank Account Form...');
  const connectBtn = page.getByRole('button', { name: /connect account/i }).first();
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    await page.waitForTimeout(600);
    const formScreenshot = path.join(SCREENSHOT_DIR, 'phase2_banking_connect_form.png');
    await page.screenshot({ path: formScreenshot });
    console.log(`✅ Saved Banking Connect Form screenshot: ${formScreenshot}`);
  }

  await browser.close();
  console.log('🎉 Phase 2 screenshot capture complete!');
}

run().catch((err) => {
  console.error('❌ Error capturing screenshots:', err);
  process.exit(1);
});
