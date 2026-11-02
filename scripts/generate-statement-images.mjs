import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('sample_statements/stress_test/images');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generate() {
  console.log('Generating realistic scenario images for testing...');
  const browser = await chromium.launch({ headless: true });

  // --------------------------------------------------------------------------
  // IMAGE 1: Clean Chase Bank Statement (High-Resolution)
  // --------------------------------------------------------------------------
  const cleanHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; padding: 40px; color: #0f172a; }
      .sheet { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 36px; max-width: 760px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 20px; }
      .bank-name { font-size: 26px; font-weight: 800; color: #0369a1; letter-spacing: -0.5px; }
      .bank-sub { font-size: 13px; color: #64748b; margin-top: 2px; }
      .period-box { text-align: right; font-size: 13px; color: #475569; }
      .period-box strong { color: #0f172a; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; background: #f1f5f9; padding: 16px; border-radius: 6px; }
      .summary-cell { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
      .summary-val { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; font-family: monospace; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
      th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; }
      td { padding: 12px 8px; border-bottom: 1px solid #f1f5f9; }
      .amount-pos { color: #16a34a; font-weight: 600; font-family: monospace; text-align: right; }
      .amount-neg { color: #dc2626; font-weight: 600; font-family: monospace; text-align: right; }
      .balance-col { font-family: monospace; text-align: right; font-weight: 600; color: #334155; }
      .footer-note { margin-top: 28px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>
          <div class="bank-name">CHASE &bull; Business Banking</div>
          <div class="bank-sub">JPMorgan Chase Bank, N.A. | Account Number: ...4129</div>
        </div>
        <div class="period-box">
          <div>Statement Period:</div>
          <div><strong>October 01, 2026 – October 31, 2026</strong></div>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-cell">Starting Balance<div class="summary-val">$10,000.00</div></div>
        <div class="summary-cell">Total Deposits<div class="summary-val" style="color: #16a34a;">+$5,441.40</div></div>
        <div class="summary-cell">Total Withdrawals<div class="summary-val" style="color: #dc2626;">-$490.00</div></div>
        <div class="summary-cell">Ending Balance<div class="summary-val">$14,951.40</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 15%;">Date</th>
            <th style="width: 45%;">Description / Narrative</th>
            <th style="width: 20%; text-align: right;">Amount ($)</th>
            <th style="width: 20%; text-align: right;">Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>2026-10-04</td>
            <td>WIRE TRANSFER CREDIT FROM ACME GLOBAL CORP</td>
            <td class="amount-pos">+3,500.00</td>
            <td class="balance-col">13,500.00</td>
          </tr>
          <tr>
            <td>2026-10-12</td>
            <td>AMAZON WEB SERVICES AWS CLOUD HOSTING</td>
            <td class="amount-neg">-450.00</td>
            <td class="balance-col">13,050.00</td>
          </tr>
          <tr>
            <td>2026-10-18</td>
            <td>STRIPE PAYMENTS TRANSFER NET SETTLEMENT</td>
            <td class="amount-pos">+1,941.40</td>
            <td class="balance-col">14,991.40</td>
          </tr>
          <tr>
            <td>2026-10-22</td>
            <td>GITHUB INC DEVELOPER SUBSCRIPTION</td>
            <td class="amount-neg">-40.00</td>
            <td class="balance-col">14,951.40</td>
          </tr>
        </tbody>
      </table>

      <div class="footer-note">
        Page 1 of 1 &bull; Electronic Account Statement &bull; Total 4 Transactions &bull; Ending Balance: $14,951.40
      </div>
    </div>
  </body>
  </html>
  `;

  const page = await browser.newPage({ viewport: { width: 900, height: 850 } });
  await page.setContent(cleanHtml);
  const cleanPath = path.join(OUTPUT_DIR, '01_clean_chase_statement.png');
  await page.screenshot({ path: cleanPath });
  console.log('✅ Generated Image 1:', cleanPath);

  // --------------------------------------------------------------------------
  // IMAGE 2: Blurry / Math Mismatch Statement Photo
  // --------------------------------------------------------------------------
  const blurryHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: sans-serif; background: #e2e8f0; padding: 40px; color: #1e293b; filter: blur(1.2px); }
      .sheet { background: #fff; border: 1px solid #94a3b8; padding: 30px; max-width: 650px; margin: 0 auto; transform: rotate(-0.5deg); }
      .title { font-size: 20px; font-weight: bold; color: #0284c7; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title">MERCURY BANK &bull; CHECKING ...8821</div>
      <p>Period: 2026-10-01 to 2026-10-31</p>
      <p><strong>Starting Balance: $5,000.00</strong></p>
      <p><strong>Ending Balance: $9,999.00 (Math Mismatch with rows)</strong></p>
      <hr>
      <p>2026-10-05 &bull; DEPOSIT CLIENT WIRE: +$1,000.00</p>
      <p>2026-10-15 &bull; WITHDRAWAL SUPPLIES: -$200.00</p>
      <p>Calculated Ending should be $5,800.00 but statement says $9,999.00</p>
    </div>
  </body>
  </html>
  `;
  await page.setContent(blurryHtml);
  const blurryPath = path.join(OUTPUT_DIR, '02_blurry_unbalanced_statement.png');
  await page.screenshot({ path: blurryPath });
  console.log('✅ Generated Image 2:', blurryPath);

  // --------------------------------------------------------------------------
  // IMAGE 3: Non-Bank Image (Dining Restaurant Receipt)
  // --------------------------------------------------------------------------
  const receiptHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { background: #cbd5e1; padding: 40px; font-family: 'Courier New', Courier, monospace; display: flex; justify-content: center; }
      .receipt { background: #fff; width: 340px; padding: 24px; border: 1px dashed #94a3b8; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 12px; margin-bottom: 12px; }
      .store { font-size: 18px; font-weight: bold; }
      .row { display: flex; justify-content: space-between; margin: 6px 0; font-size: 13px; }
      .total-row { border-top: 1px dashed #000; margin-top: 12px; padding-top: 8px; font-weight: bold; font-size: 15px; }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="header">
        <div class="store">LUIGI'S TRATTORIA</div>
        <div>104 Ocean Avenue</div>
        <div>Order #4819 &bull; Table 7</div>
        <div>2026-10-24 19:42</div>
      </div>
      <div class="row"><span>1x Margherita Pizza</span><span>$18.50</span></div>
      <div class="row"><span>1x Truffle Pasta</span><span>$24.00</span></div>
      <div class="row"><span>2x Italian Soda</span><span>$10.00</span></div>
      <div class="row"><span>1x Tiramisu Dessert</span><span>$9.00</span></div>
      <div class="row total-row"><span>SUBTOTAL</span><span>$61.50</span></div>
      <div class="row"><span>TAX (8.25%)</span><span>$5.07</span></div>
      <div class="row total-row"><span>TOTAL AMOUNT</span><span>$66.57</span></div>
      <div style="text-align: center; margin-top: 20px; font-size: 11px;">THANK YOU FOR DINING WITH US!</div>
    </div>
  </body>
  </html>
  `;
  await page.setContent(receiptHtml);
  const receiptPath = path.join(OUTPUT_DIR, '03_dining_receipt_not_bank.png');
  await page.screenshot({ path: receiptPath });
  console.log('✅ Generated Image 3:', receiptPath);

  await browser.close();
}

generate().catch(console.error);
