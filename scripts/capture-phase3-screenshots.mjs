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
  console.log('🚀 Launching Chromium to capture Phase 3 Reports & Settings UI...');
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

  // 1. Reports Screen - P&L
  console.log('📸 Navigating to http://localhost:3000/reports ...');
  await page.goto('http://localhost:3000/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const pnlScreenshot = path.join(SCREENSHOT_DIR, 'phase3_reports_pnl.png');
  await page.screenshot({ path: pnlScreenshot });
  console.log(`✅ Saved Reports P&L screenshot: ${pnlScreenshot}`);

  // 2. Reports Screen - Balance Sheet
  console.log('📸 Switching to Balance Sheet tab...');
  const bsBtn = page.getByRole('button', { name: /balance sheet/i }).first();
  if (await bsBtn.isVisible()) {
    await bsBtn.click();
    await page.waitForTimeout(800);
    const bsScreenshot = path.join(SCREENSHOT_DIR, 'phase3_reports_balance_sheet.png');
    await page.screenshot({ path: bsScreenshot });
    console.log(`✅ Saved Reports Balance Sheet screenshot: ${bsScreenshot}`);
  }

  // 3. Reports Screen - Trial Balance
  console.log('📸 Switching to Trial Balance tab...');
  const tbBtn = page.getByRole('button', { name: /trial balance/i }).first();
  if (await tbBtn.isVisible()) {
    await tbBtn.click();
    await page.waitForTimeout(800);
    const tbScreenshot = path.join(SCREENSHOT_DIR, 'phase3_reports_trial_balance.png');
    await page.screenshot({ path: tbScreenshot });
    console.log(`✅ Saved Reports Trial Balance screenshot: ${tbScreenshot}`);
  }

  // 4. Settings Screen - AI Guardrails
  console.log('📸 Navigating to http://localhost:3000/settings ...');
  await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const settingsGuardrails = path.join(SCREENSHOT_DIR, 'phase3_settings_guardrails.png');
  await page.screenshot({ path: settingsGuardrails });
  console.log(`✅ Saved Settings Guardrails screenshot: ${settingsGuardrails}`);

  // 5. Settings Screen - Organization Profile
  console.log('📸 Switching to Organization tab...');
  const orgTab = page.getByRole('button', { name: /company profile/i }).first();
  if (await orgTab.isVisible()) {
    await orgTab.click();
    await page.waitForTimeout(800);
    const settingsOrg = path.join(SCREENSHOT_DIR, 'phase3_settings_organization.png');
    await page.screenshot({ path: settingsOrg });
    console.log(`✅ Saved Settings Organization screenshot: ${settingsOrg}`);
  }

  // 6. Settings Screen - Team & Roles
  console.log('📸 Switching to Team tab...');
  const teamTab = page.getByRole('button', { name: /team & roles/i }).first();
  if (await teamTab.isVisible()) {
    await teamTab.click();
    await page.waitForTimeout(800);
    const settingsTeam = path.join(SCREENSHOT_DIR, 'phase3_settings_team.png');
    await page.screenshot({ path: settingsTeam });
    console.log(`✅ Saved Settings Team screenshot: ${settingsTeam}`);
  }

  await browser.close();
  console.log('🎉 Phase 3 screenshot capture complete!');
}

run().catch((err) => {
  console.error('❌ Error capturing screenshots:', err);
  process.exit(1);
});
