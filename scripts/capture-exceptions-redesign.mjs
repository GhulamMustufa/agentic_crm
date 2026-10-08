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
  console.log('🚀 Launching Chromium to capture the redesigned Review & Approvals screen...');
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

  console.log('📸 Navigating to http://localhost:3000/exceptions...');
  await page.goto('http://localhost:3000/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture standard redesigned view
  const screenshotPath1 = path.join(SCREENSHOT_DIR, 'redesigned_exceptions_master_detail.png');
  await page.screenshot({ path: screenshotPath1 });
  console.log(`✅ Saved redesigned screenshot: ${screenshotPath1}`);

  // Test expanding raw bank memo
  const expandMemoBtn = page.getByText(/View Original Bank Statement Memo/i).first();
  if (await expandMemoBtn.isVisible()) {
    console.log('🔍 Clicking Expand Raw Bank Memo...');
    await expandMemoBtn.click();
    await page.waitForTimeout(500);
    const screenshotPath2 = path.join(SCREENSHOT_DIR, 'redesigned_exceptions_expanded_memo.png');
    await page.screenshot({ path: screenshotPath2 });
    console.log(`✅ Saved expanded memo screenshot: ${screenshotPath2}`);
  }

  await browser.close();
  console.log('🎉 Screenshot capture complete!');
}

run().catch((err) => {
  console.error('❌ Error capturing screenshot:', err);
  process.exit(1);
});
