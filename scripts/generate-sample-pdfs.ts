import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'sample_statements');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function buildPdf(lines: string[]): Buffer {
  const content = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Length 1000 >>',
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

// 1. Variation 1: Clean Standard Bank Statement (USD, Mercury Bank)
const var1 = buildPdf([
  '================================================================',
  '                 MERCURY COMMERCIAL BANK STATEMENT              ',
  '================================================================',
  'Statement Period: 2026-10-01 to 2026-10-31',
  'Starting Balance: $50,000.00',
  'Ending Balance: $74,200.00',
  '',
  'DATE        DESCRIPTION                             AMOUNT',
  '----------------------------------------------------------------',
  '2026-10-05  Starlight Client Wire Inflow            $30,000.00',
  '2026-10-12  Cloudflare Network Hosting CDN          -$1,400.00',
  '2026-10-20  Gusto Payroll Direct Deposit Run        -$4,400.00',
  '================================================================',
]);
fs.writeFileSync(path.join(outDir, 'variation_1_clean_standard_mercury.pdf'), var1);

// 2. Variation 2: Ambiguous Vendor Charges (Exception Center Routing)
const var2 = buildPdf([
  '================================================================',
  '                 MERCURY COMMERCIAL BANK STATEMENT              ',
  '================================================================',
  'Statement Period: 2026-11-01 to 2026-11-30',
  'Starting Balance: $74,200.00',
  'Ending Balance: $64,450.00',
  '',
  'DATE        DESCRIPTION                             AMOUNT',
  '----------------------------------------------------------------',
  '2026-11-04  Apex Executive Retreat Resort           -$8,500.00',
  '2026-11-15  Unrecognized Vendor Wire 991828         -$1,250.00',
  '================================================================',
]);
fs.writeFileSync(path.join(outDir, 'variation_2_exception_vendor_unmapped.pdf'), var2);

// 3. Variation 3: Malaysian Maybank Statement (Bahasa Melayu & RM)
const var3 = buildPdf([
  '================================================================',
  '                     MAYBANK ISLAMIC BERHAD                     ',
  '                      Penyata Akaun Semasa                      ',
  '================================================================',
  'Tempoh Penyata: 2026-03-01 hingga 2026-03-31',
  'Baki Awal: RM 25,000.00',
  'Baki Akhir: RM 31,315.00',
  '',
  'TARIKH      BUTIRAN TRANSAKSI                       AMAUN',
  '----------------------------------------------------------------',
  '2026-03-05  Bayaran Invois Pelanggan INV-MY-101     RM 8,500.00',
  '2026-03-12  DuitNow QR Maybank Din Tai Fung         -RM 185.00',
  '2026-03-20  Sewa Pejabat Menara Maybank             -RM 3,200.00',
  '2026-03-25  TNB Bil Elektrik Pejabat                -RM 650.00',
  '2026-03-28  Gaji Pekerja Mac 2026                   -RM 4,500.00',
  '================================================================',
]);
fs.writeFileSync(path.join(outDir, 'variation_3_malaysia_maybank_myr.pdf'), var3);

// 4. Variation 4: Chinese ICBC Statement (中文 & CNY / ¥)
const var4 = buildPdf([
  '================================================================',
  '                    中国工商银行 电子对账单                     ',
  '================================================================',
  '账单周期: 2026-03-01 至 2026-03-31',
  '期初余额: ¥ 80,000.00',
  '期末余额: ¥ 95,800.00',
  '',
  '交易日期    交易说明 / 摘要                         交易金额',
  '----------------------------------------------------------------',
  '2026-03-05  华为云技术服务费                        -¥ 5,400.00',
  '2026-03-10  收到北京客户货款发票 INV-CN-88          ¥ 25,000.00',
  '2026-03-15  微信支付 - 商务餐费                     -¥ 380.00',
  '2026-03-20  办公室物业租金                          -¥ 8,000.00',
  '2026-03-28  腾讯云服务器年费续费                    -¥ 3,600.00',
  '================================================================',
]);
fs.writeFileSync(path.join(outDir, 'variation_4_china_icbc_cny.pdf'), var4);

// 5. Variation 5: Period Collision (Same period as Variation 1 for duplicate detection)
const var5 = buildPdf([
  '================================================================',
  '                 MERCURY COMMERCIAL BANK STATEMENT              ',
  '================================================================',
  'Statement Period: 2026-10-01 to 2026-10-31',
  'Starting Balance: $50,000.00',
  'Ending Balance: $58,500.00',
  '',
  'DATE        DESCRIPTION                             AMOUNT',
  '----------------------------------------------------------------',
  '2026-10-08  Conflicting Overlapping Statement File  $8,500.00',
  '================================================================',
]);
fs.writeFileSync(path.join(outDir, 'variation_5_period_collision_test.pdf'), var5);

// 6. Variation 6: Corrupt / Malformed PDF (Tests Graceful 400 Bad Request Resilience)
const var6 = Buffer.from(
  'NOT_A_VALID_PDF_HEADER\nCorrupted content stream without trailer or EOF marker',
  'utf-8',
);
fs.writeFileSync(path.join(outDir, 'variation_6_corrupt_malformed_test.pdf'), var6);

console.log('Successfully generated 6 sample PDF variations in sample_statements/:');
fs.readdirSync(outDir).forEach((file) => console.log(' - ' + file));
