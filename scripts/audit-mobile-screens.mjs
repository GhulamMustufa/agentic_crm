import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/8050f510-f515-4191-9945-1dc835df7f96';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots/mobile');

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

const screens = [
  { name: 'dashboard', path: '/' },
  { name: 'exceptions', path: '/exceptions' },
  { name: 'banking', path: '/banking' },
  { name: 'transactions', path: '/transactions' },
  { name: 'invoices', path: '/invoices' },
  { name: 'reports', path: '/reports' },
  { name: 'settings', path: '/settings' },
];

async function run() {
  console.log('📱 Launching mobile audit (iPhone 14 / 390x844)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
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

  for (const screen of screens) {
    console.log(`📸 Capturing mobile view for ${screen.name} (${screen.path})...`);
    await page.goto(`http://localhost:3000${screen.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const shotPath = path.join(SCREENSHOT_DIR, `mobile_${screen.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`✅ Saved: ${shotPath}`);
  }

  // Also capture mobile drawer / menu open
  console.log('📸 Opening mobile navigation drawer...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  const menuBtn = page.getByRole('button').filter({ has: page.locator('svg.lucide-menu') }).first();
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
    await page.waitForTimeout(500);
    const drawerPath = path.join(SCREENSHOT_DIR, 'mobile_nav_drawer.png');
    await page.screenshot({ path: drawerPath });
    console.log(`✅ Saved: ${drawerPath}`);
  }

  await browser.close();
  console.log('🎉 Mobile audit screenshots captured successfully!');
}

run().catch((err) => {
  console.error('❌ Error during mobile audit:', err);
  process.exit(1);
});
