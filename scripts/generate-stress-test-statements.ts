import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'sample_statements/stress_test');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function buildSimplePdf(lines: string[]): Buffer {
  const content = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Length 2000 >>',
    'stream',
    ...lines,
    'endstream',
    'endobj',
    'xref',
    '0 2',
    '0000000000 65535 f ',
    '0000000010 00000 n ',
    'trailer',
    '<< /Size 2 >>',
    'startxref',
    '500',
    '%%EOF',
  ].join('\n');
  return Buffer.from(content, 'utf-8');
}

// ============================================================================
// 1. SCENARIO 1: US Clean Standard (Chase / Mercury) - MM/DD/YYYY Dates
// ============================================================================
const scenario1Csv = `Date,Description,Amount,Reference
10/05/2026,Starlight Client Corp Wire Transfer,30000.00,WIRE-STAR-991
10/12/2026,Amazon Web Services AWS Cloud Hosting,-450.25,AWS-BILL-102
10/18/2026,Google Workspace Enterprise Email,-120.00,GSUITE-OCT
10/24/2026,Slack Technologies Team Subscription,-85.00,SLACK-INV-44
10/28/2026,Gusto Payroll Tax & Salary Deposit,-6500.00,GUSTO-PAYROLL-10
`;
fs.writeFileSync(path.join(outDir, '01_us_standard_chase_mercury.csv'), scenario1Csv);

const scenario1Pdf = buildSimplePdf([
  '================================================================',
  '                 CHASE COMMERCIAL BANKING STATEMENT              ',
  '================================================================',
  'Account Number: *******1029              Currency: USD',
  'Statement Period: 10/01/2026 to 10/31/2026',
  'Starting Balance: $50,000.00             Ending Balance: $72,844.75',
  '',
  'DATE        DESCRIPTION                             AMOUNT',
  '----------------------------------------------------------------',
  '10/05/2026  Starlight Client Corp Wire Transfer     $30,000.00',
  '10/12/2026  Amazon Web Services AWS Cloud Hosting   -$450.25',
  '10/18/2026  Google Workspace Enterprise Email       -$120.00',
  '10/24/2026  Slack Technologies Team Subscription    -$85.00',
  '10/28/2026  Gusto Payroll Tax & Salary Deposit      -$6,500.00',
  '================================================================',
]);
fs.writeFileSync(path.join(outDir, '01_us_standard_chase_mercury.pdf'), scenario1Pdf);

// ============================================================================
// 2. SCENARIO 2: Malaysian Commonwealth (Maybank) - DD/MM/YYYY Dual-Column
// ============================================================================
const scenario2Csv = `Tarikh,Butiran,Wang Keluar,Wang Masuk,Baki
05/10/2026,Bayaran Pelanggan Nusantara Tech Solutions,,25000.00,75000.00
12/10/2026,Tenaga Nasional Berhad Bil Elektrik Pejabat,850.40,,74149.60
18/10/2026,Sewa Pejabat Korporat Menara Maybank,4500.00,,69649.60
22/10/2026,DuitNow QR Lunch Meeting Din Tai Fung,185.00,,69464.60
28/10/2026,Gaji Kakitangan Oktober 2026,8500.00,,60964.60
`;
fs.writeFileSync(path.join(outDir, '02_malaysia_maybank_dual_column.csv'), scenario2Csv);

const scenario2Pdf = buildSimplePdf([
  '================================================================',
  '                     MAYBANK ISLAMIC BERHAD                     ',
  '                      Penyata Akaun Semasa                      ',
  '================================================================',
  'No Akaun: 5140-1200-9981                 Mata Wang: MYR',
  'Tempoh: 01/10/2026 hingga 31/10/2026',
  'Baki Awal: RM 50,000.00                  Baki Akhir: RM 60,964.60',
  '',
  'TARIKH      BUTIRAN TRANSAKSI            KELUAR (RM)  MASUK (RM)',
  '----------------------------------------------------------------',
  '05/10/2026  Bayaran Pelanggan Nusantara              25,000.00',
  '12/10/2026  TNB Bil Elektrik Pejabat     850.40',
  '18/10/2026  Sewa Menara Maybank          4,500.00',
  '22/10/2026  DuitNow QR Din Tai Fung      185.00',
  '28/10/2026  Gaji Kakitangan Oktober      8,500.00',
  '================================================================',
]);
fs.writeFileSync(path.join(outDir, '02_malaysia_maybank_dual_column.pdf'), scenario2Pdf);

// ============================================================================
// 3. SCENARIO 3: Stripe / Payment Gateway Net Payouts ($1,000 Invoice -> $970.70 Payout)
// ============================================================================
const scenario3Csv = `Date,Description,Amount,Reference
2026-10-15,STRIPE PAYOUT TRANSFER FOR INV-2026-STRIPE,970.70,STRIPE-PO-99182
2026-10-16,PAYPAL MERCHANT DIRECT TRANSFER INV-2026-PAYPAL,485.00,PAYPAL-TR-441
`;
fs.writeFileSync(path.join(outDir, '03_stripe_payment_gateway_net_payouts.csv'), scenario3Csv);

// ============================================================================
// 4. SCENARIO 4: Typo Counterparty Settlement (Fuzzy Match & Suffix Stripping)
// ============================================================================
const scenario4Csv = `Date,Description,Amount,Reference
2026-10-10,WIRE INCOMING FROM STARIGHT HOLDINGS LLC - INV 2026 STARLIGHT,5000.00,WIRE-9921
2026-10-14,ACH DIRECT DEPOSIT ACME LOGISTIC SERVICES INC,3500.00,ACH-4419
`;
fs.writeFileSync(path.join(outDir, '04_fuzzy_typo_counterparty_settlement.csv'), scenario4Csv);

// ============================================================================
// 5. SCENARIO 5: Batch Multi-Invoice Settlement ($10,000 Wire -> 3 Invoices)
// ============================================================================
const scenario5Csv = `Date,Description,Amount,Reference
2026-10-20,LUMP SUM BATCH SETTLEMENT ENTERPRISE PARTNERS GRP,10000.00,BATCH-WIRE-10K
`;
fs.writeFileSync(path.join(outDir, '05_batch_multi_invoice_settlement.csv'), scenario5Csv);

// ============================================================================
// 6. SCENARIO 6: Partial Milestone Installment Payment
// ============================================================================
const scenario6Csv = `Date,Description,Amount,Reference
2026-10-12,PARTIAL MILESTONE 1 PAYMENT FOR INV-2026-MILESTONE,1000.00,MILESTONE-01
`;
fs.writeFileSync(path.join(outDir, '06_partial_milestone_installment.csv'), scenario6Csv);

// ============================================================================
// 7. SCENARIO 7: Multi-Category Split Expense Receipt (Costco & Hardware)
// ============================================================================
const scenario7Csv = `Date,Description,Amount,Reference
2026-10-15,COSTCO WHOLESALE WAREHOUSE 102,-650.00,POS-DEBIT-991
2026-10-18,BEST BUY COMMERCIAL STORE 448,-1200.00,POS-DEBIT-448
`;
fs.writeFileSync(path.join(outDir, '07_split_receipt_multi_category.csv'), scenario7Csv);

// ============================================================================
// 8. SCENARIO 8: Owner Personal Draw / Coffee / Retail Outflows
// ============================================================================
const scenario8Csv = `Date,Description,Amount,Reference
2026-10-08,STARBUCKS RESERVE COFFEE ROASTERY,-24.50,POS-CARD-881
2026-10-14,SEPHORA BEAUTY STORE DOWNTOWN,-145.00,POS-CARD-331
2026-10-22,WHOLE FOODS ORGANIC GROCERIES,-185.30,POS-CARD-442
`;
fs.writeFileSync(path.join(outDir, '08_owner_personal_draws.csv'), scenario8Csv);

// ============================================================================
// 9. SCENARIO 9: Closed Period Backdated Ingestion (Tamper Protection)
// ============================================================================
const scenario9Csv = `Date,Description,Amount,Reference
2026-01-15,BACKDATED HISTORICAL WIRE IN CLOSED PERIOD,15000.00,OLD-WIRE-2026
2026-01-20,OLD EXPENSE IN LOCKED JANUARY 2026,-1200.00,OLD-EXP-2026
`;
fs.writeFileSync(path.join(outDir, '09_closed_period_backdated_tamper_test.csv'), scenario9Csv);

// ============================================================================
// 10. SCENARIO 10: Global Merchant Cold-Start Ingestion (Zero Exceptions Day 1)
// ============================================================================
const scenario10Csv = `Date,Description,Amount,Reference
2026-10-02,AMAZON WEB SERVICES AWS.AMAZON.COM WA,-245.50,AWS-OCT-01
2026-10-05,GOOGLE CLOUD PLATFORM GSUITE CA,-89.00,GCP-OCT-02
2026-10-10,STRIPE MONTHLY PROCESSING FEES,-25.00,STRIPE-FEE-10
2026-10-15,UBER TRIP SAN FRANCISCO CA,-34.50,UBER-9912
2026-10-20,GITHUB ENTERPRISE TEAM SEATS,-42.00,GH-ORG-10
2026-10-25,ZOOM VIDEO COMMUNICATIONS,-15.99,ZOOM-OCT
`;
fs.writeFileSync(path.join(outDir, '10_global_merchant_cold_start.csv'), scenario10Csv);

console.log('✅ Generated 10 Comprehensive Bank Statement Stress-Test Files in:');
console.log(outDir);
