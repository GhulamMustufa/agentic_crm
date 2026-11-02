import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/8050f510-f515-4191-9945-1dc835df7f96';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots/image_uploads');
const LOCAL_SCREENSHOT_DIR = path.resolve('artifacts/screenshots/image_uploads');

for (const dir of [SCREENSHOT_DIR, LOCAL_SCREENSHOT_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

async function capture(page, filename) {
  const p1 = path.join(SCREENSHOT_DIR, filename);
  const p2 = path.join(LOCAL_SCREENSHOT_DIR, filename);
  await page.screenshot({ path: p1, fullPage: false });
  fs.copyFileSync(p1, p2);
  console.log(`   📸 Captured: ${filename}`);
}

async function run() {
  console.log('================================================================');
  console.log('🚀 RUNNING PLAYWRIGHT MULTIMODAL IMAGE BANK STATEMENT TEST');
  console.log('   Provider: Google Gemini 3.5 Flash-Lite (Vision)');
  console.log('   Scenario 1: Clean High-Resolution Chase Statement Photo');
  console.log('   Scenario 2: Blurry / Unbalanced Math Mismatch Statement Photo');
  console.log('   Scenario 3: Non-Bank Image / Dining Restaurant Receipt');
  console.log('================================================================\n');

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

  // Listen for console logs and network errors for debugging
  page.on('console', (msg) => {
    if (
      msg.type() === 'error' ||
      msg.text().includes('Queue') ||
      msg.text().includes('Statement')
    ) {
      console.log(`   [Browser ${msg.type()}]:`, msg.text());
    }
  });

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('agentic_os_token', token);
      localStorage.setItem('agentic_os_user', JSON.stringify(user));
      localStorage.setItem('agentic_os_tenant_id', user.tenantId);
    },
    { token, user },
  );

  // --------------------------------------------------------------------------
  // STEP 1: Initial Banking Dashboard State
  // --------------------------------------------------------------------------
  console.log('📍 [Step 1]: Navigating to Banking Dashboard...');
  await page.goto('http://localhost:3099/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await capture(page, 'image01_banking_initial_state.png');

  // --------------------------------------------------------------------------
  // STEP 2: SCENARIO 1 - Clean Chase Statement Photo (High-Res)
  // --------------------------------------------------------------------------
  console.log('📍 [Step 2]: Uploading 01_clean_chase_statement.png...');
  const file1 = path.resolve('sample_statements/stress_test/images/01_clean_chase_statement.png');
  const fileInput = page.locator('input[type="file"]').first();

  await fileInput.setInputFiles(file1);
  console.log('   📤 File selected in input. Waiting for upload and queue card...');

  // Wait 1.5s to capture the active uploading / extracting queue state
  await page.waitForTimeout(1800);
  await capture(page, 'image02_clean_statement_uploading.png');

  console.log('   ⏳ Waiting for Gemini extraction and reconciliation completion (up to 30s)...');
  let completed = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const content = await page.content();
    if (
      content.includes('reconciled successfully') ||
      content.includes('CHASE') ||
      content.includes('14,951.40') ||
      content.includes('ACME GLOBAL CORP')
    ) {
      completed = true;
      console.log(`   ✅ Clean statement processed successfully after ${i + 1}s!`);
      break;
    }
  }

  await page.waitForTimeout(2000);
  await capture(page, 'image03_clean_statement_extracted_reconciled.png');

  // --------------------------------------------------------------------------
  // STEP 3: SCENARIO 2 - Blurry / Math Mismatch Statement Photo
  // --------------------------------------------------------------------------
  console.log('\n📍 [Step 3]: Uploading 02_blurry_unbalanced_statement.png (Math Mismatch)...');
  const file2 = path.resolve(
    'sample_statements/stress_test/images/02_blurry_unbalanced_statement.png',
  );
  await fileInput.setInputFiles(file2);

  // Wait for processing and failure toast / badge
  console.log('   ⏳ Waiting for mathematical validation engine rejection...');
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const content = await page.content();
    if (
      content.includes('validation failed') ||
      content.includes('checksum') ||
      content.includes('Failed') ||
      content.includes('RECONCILIATION_EXCEPTION')
    ) {
      console.log(`   🛡️ Invariant Check caught mismatch after ${i + 1}s!`);
      break;
    }
  }

  await page.waitForTimeout(1500);
  await capture(page, 'image04_math_mismatch_quarantined_banking.png');

  console.log('   📍 Visiting Exception Center to inspect quarantined statement...');
  await page.goto('http://localhost:3099/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await capture(page, 'image05_exception_center_math_mismatch.png');

  // --------------------------------------------------------------------------
  // STEP 4: SCENARIO 3 - Non-Bank Image / Dining Restaurant Receipt
  // --------------------------------------------------------------------------
  console.log(
    '\n📍 [Step 4]: Navigating back to Banking and uploading 03_dining_receipt_not_bank.png...',
  );
  await page.goto('http://localhost:3099/banking', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const file3 = path.resolve('sample_statements/stress_test/images/03_dining_receipt_not_bank.png');
  const fileInput3 = page.locator('input[type="file"]').first();
  await fileInput3.setInputFiles(file3);

  console.log('   ⏳ Waiting for authenticity sanity gate rejection...');
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const content = await page.content();
    if (
      content.includes('not an authentic bank') ||
      content.includes('unrecognizable') ||
      content.includes('Failed') ||
      content.includes('EXTRACTION_UNCERTAIN')
    ) {
      console.log(`   🛡️ Sanity Gate rejected dining receipt after ${i + 1}s!`);
      break;
    }
  }

  await page.waitForTimeout(1500);
  await capture(page, 'image06_non_bank_receipt_rejected.png');

  console.log('   📍 Visiting Exception Center for audit trail...');
  await page.goto('http://localhost:3099/exceptions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await capture(page, 'image07_exception_center_unrecognized_document.png');

  await browser.close();
  console.log('\n================================================================');
  console.log('🏁 PLAYWRIGHT IMAGE UPLOADS TEST COMPLETED WITH 7 SCREENSHOTS');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
