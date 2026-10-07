import { describe, it, expect, beforeAll } from 'vitest';

import { CsvStatementParser } from '../../src/modules/banking/parsers/csv-statement.parser';
import {
  parseMonetaryCents,
  normalizeDate,
} from '../../src/modules/banking/parsers/csv-statement.parser';
import { PdfStatementParser } from '../../src/modules/banking/parsers/pdf-statement.parser';

import type { AiStatementParser } from '../../src/modules/banking/parsers/ai-statement.parser';

describe('Multilingual & Multi-Currency Engine (Malaysia MYR & China CNY)', () => {
  let csvParser: CsvStatementParser;
  let pdfParser: PdfStatementParser;

  beforeAll(() => {
    csvParser = new CsvStatementParser();
    pdfParser = new PdfStatementParser({} as unknown as AiStatementParser);
  });

  describe('Monetary & Date Normalization', () => {
    it('correctly parses Malaysian Ringgit amounts', () => {
      expect(parseMonetaryCents('RM 1,250.50')).toBe(125050n);
      expect(parseMonetaryCents('-RM450.00')).toBe(-45000n);
      expect(parseMonetaryCents('MYR 3,000.00')).toBe(300000n);
      expect(parseMonetaryCents('(RM 85.20)')).toBe(-8520n);
      expect(parseMonetaryCents('1,200.00 DR')).toBe(-120000n);
      expect(parseMonetaryCents('500.00 CR')).toBe(50000n);
    });

    it('correctly parses Chinese Yuan / RMB amounts', () => {
      expect(parseMonetaryCents('¥ 5,800.00')).toBe(580000n);
      expect(parseMonetaryCents('-¥120.50')).toBe(-12050n);
      expect(parseMonetaryCents('RMB 18,000.00')).toBe(1800000n);
      expect(parseMonetaryCents('CNY 450.00')).toBe(45000n);
      expect(parseMonetaryCents('880.00元')).toBe(88000n);
    });

    it('normalizes Malaysian and Chinese date formats', () => {
      // Commonwealth DD/MM/YYYY format (Malaysia)
      expect(normalizeDate('25/03/2026')).toBe('2026-03-25');
      expect(normalizeDate('15/10/2026')).toBe('2026-10-15');
      // Chinese YYYY年MM月DD日 format
      expect(normalizeDate('2026年3月15日')).toBe('2026-03-15');
      expect(normalizeDate('2026年11月08日')).toBe('2026-11-08');
      // Chinese dot format YYYY.MM.DD
      expect(normalizeDate('2026.04.01')).toBe('2026-04-01');
      // Standard ISO
      expect(normalizeDate('2026-05-20')).toBe('2026-05-20');
    });
  });

  describe('Malaysian Bank Statement (Bahasa Melayu & MYR)', () => {
    it('parses Maybank / CIMB format CSV with Malay headers', async () => {
      const csvData = [
        'Tarikh,Butiran,Wang Keluar,Wang Masuk,Baki',
        '15/03/2026,Gaji Pekerja Mac 2026,RM 4500.00,,RM 15500.00',
        '18/03/2026,Bayaran Pelanggan Syarikat Maju,,RM 8200.00,RM 23700.00',
        '22/03/2026,Sewa Pejabat Menara Maybank,RM 3200.00,,RM 20500.00',
      ].join('\n');

      const result = await csvParser.parse(csvData);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0]?.date).toBe('2026-03-15');
      expect(result.transactions[0]?.description).toBe('Gaji Pekerja Mac 2026');
      expect(result.transactions[0]?.amountCents).toBe(-450000n); // Debit
      expect(result.transactions[1]?.amountCents).toBe(820000n); // Credit
      expect(result.transactions[2]?.amountCents).toBe(-320000n); // Debit
      expect(result.totalDebitsCents).toBe(770000n);
      expect(result.totalCreditsCents).toBe(820000n);
    });

    it('parses Malaysian PDF statement with Tempoh Penyata & RM currency', async () => {
      const pdfText = [
        '%PDF-1.4',
        'MAYBANK ISLAMIC BERHAD',
        'Penyata Akaun Semasa',
        'Tempoh Penyata: 2026-03-01 hingga 2026-03-31',
        'Baki Awal: RM 10,000.00',
        'Baki Akhir: RM 15,200.00',
        '',
        '2026-03-05 | Bayaran Invois Pelanggan INV-MY-101 | RM 8,500.00',
        '2026-03-12 | DuitNow QR Maybank Din Tai Fung | -RM 300.00',
        '2026-03-25 | TNB Bil Elektrik Pejabat | -RM 3,000.00',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.startDate).toBe('2026-03-01');
      expect(result.endDate).toBe('2026-03-31');
      expect(result.openingBalanceCents).toBe(1000000n);
      expect(result.closingBalanceCents).toBe(1520000n);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0]?.description).toContain('INV-MY-101');
      expect(result.transactions[0]?.amountCents).toBe(850000n);
      expect(result.transactions[1]?.amountCents).toBe(-30000n);
    });

    it('parses CIMB Bank dual-column PDF statement end-to-end', async () => {
      const pdfText = [
        '%PDF-1.4',
        'CIMB BANK BERHAD',
        'PENYATA AKAUN / ACCOUNT STATEMENT',
        'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026',
        'OPENING BALANCE: 25,000.00',
        'CLOSING BALANCE: 29,800.00',
        '',
        'TARIKH / DATE | BUTIRAN / DESCRIPTION | WANG KELUAR (DR) | WANG MASUK (CR) | BAKI / BALANCE',
        '05/06/2026 | DUITNOW QR TRANSFER | 200.00 | | 24,800.00',
        'REF: DNT123456789012',
        '15/06/2026 | BAYARAN PELANGGAN INV-88 | | 5,000.00 | 29,800.00',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.startDate).toBe('2026-06-01');
      expect(result.endDate).toBe('2026-06-30');
      expect(result.openingBalanceCents).toBe(2500000n);
      expect(result.closingBalanceCents).toBe(2980000n);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]?.amountCents).toBe(-20000n);
      expect(result.transactions[0]?.description).toContain('DUITNOW');
      expect(result.transactions[1]?.amountCents).toBe(500000n);
      expect(result.transactions[1]?.description).toContain('BAYARAN PELANGGAN');
    });

    it('parses Public Bank 6-column PDF statement with cheque numbers end-to-end', async () => {
      const pdfText = [
        '%PDF-1.4',
        'PUBLIC BANK BERHAD',
        'STATEMENT OF ACCOUNT',
        'DATE: 30/06/2026',
        'BALANCE B/F 15,000.00',
        'DATE | PARTICULARS | CHQ NO | DEBIT | CREDIT | BALANCE',
        '02/06/2026 | SUPPLIER PAYMENT | 654321 | 3,200.00 | | 11,800.00',
        '10/06/2026 | CUSTOMER DIRECT DEPOSIT | | | 6,500.00 | 18,300.00',
        'BALANCE C/F 18,300.00',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.openingBalanceCents).toBe(1500000n);
      expect(result.closingBalanceCents).toBe(1830000n);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]?.amountCents).toBe(-320000n);
      expect(result.transactions[0]?.referenceNumber).toBe('654321');
      expect(result.transactions[1]?.amountCents).toBe(650000n);
    });

    it('parses RHB Bank dual-column PDF statement end-to-end', async () => {
      const pdfText = [
        '%PDF-1.4',
        'RHB BANK BERHAD',
        'CURRENT ACCOUNT STATEMENT',
        'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026',
        'OPENING BALANCE: 40,000.00',
        'CLOSING BALANCE: 38,500.00',
        'DATE | DESCRIPTION / BUTIRAN | DEBIT (RM) | CREDIT (RM) | BALANCE (RM)',
        '08/06/2026 | OFFICE RENTAL MENARA RHB | 1,500.00 | | 38,500.00',
        'RECIPIENT: MENARA REALTY SDN BHD',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.openingBalanceCents).toBe(4000000n);
      expect(result.closingBalanceCents).toBe(3850000n);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]?.amountCents).toBe(-150000n);
      expect(result.transactions[0]?.description).toContain('OFFICE RENTAL');
      expect(result.transactions[0]?.description).toContain('MENARA REALTY');
    });

    it('parses Hong Leong Bank dual-column PDF statement end-to-end', async () => {
      const pdfText = [
        '%PDF-1.4',
        'HONG LEONG BANK BERHAD',
        'STATEMENT OF ACCOUNT',
        'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026',
        'Balance B/F 12,000.00',
        'DATE | TRANSACTION DETAILS | WITHDRAWALS (DR) | DEPOSITS (CR) | BALANCE',
        '12/06/2026 | CLIENT SETTLEMENT INV-990 | | 8,000.00 | 20,000.00',
        'REF: HLB9988776655',
        'Balance C/F 20,000.00',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.openingBalanceCents).toBe(1200000n);
      expect(result.closingBalanceCents).toBe(2000000n);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]?.amountCents).toBe(800000n);
      expect(result.transactions[0]?.referenceNumber).toBe('HLB9988776655');
    });

    it('parses AmBank dual-column PDF statement end-to-end', async () => {
      const pdfText = [
        '%PDF-1.4',
        'AMBANK (M) BERHAD',
        'CURRENT ACCOUNT STATEMENT',
        'STATEMENT PERIOD: 01/06/2026 TO 30/06/2026',
        'OPENING BALANCE: 50,000.00',
        'CLOSING BALANCE: 56,650.00',
        'DATE | DESCRIPTION | DEBIT | CREDIT | BALANCE',
        '02/06/2026 | DUITNOW QR TRANSFER | 350.00 | | 49,650.00',
        'REF: AMB9876543210',
        '20/06/2026 | CLIENT SETTLEMENT | | 7,000.00 | 56,650.00',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.openingBalanceCents).toBe(5000000n);
      expect(result.closingBalanceCents).toBe(5665000n);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]?.amountCents).toBe(-35000n);
      expect(result.transactions[0]?.referenceNumber).toBe('AMB9876543210');
      expect(result.transactions[1]?.amountCents).toBe(700000n);
    });

    it('parses Bank Islam Islamic format PDF statement end-to-end', async () => {
      const pdfText = [
        '%PDF-1.4',
        'BANK ISLAM MALAYSIA BERHAD',
        'PENYATA AKAUN / ACCOUNT STATEMENT',
        'TEMPOH PENYATA: 01/06/2026 HINGGA 30/06/2026',
        'BAKI AWAL: 30,000.00',
        'BAKI AKHIR: 37,350.00',
        'TARIKH | BUTIRAN | DEBIT | KREDIT | BAKI',
        '05/06/2026 | DUITNOW QR PAYMENT | 150.00 | | 29,850.00',
        'NO. RUJUKAN: BIMB123456789012',
        '25/06/2026 | BAYARAN DITERIMA INV-990 | | 7,500.00 | 37,350.00',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.openingBalanceCents).toBe(3000000n);
      expect(result.closingBalanceCents).toBe(3735000n);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]?.amountCents).toBe(-15000n);
      expect(result.transactions[0]?.referenceNumber).toBe('BIMB123456789012');
      expect(result.transactions[1]?.amountCents).toBe(750000n);
    });
  });

  describe('Chinese Bank Statement (中文 & CNY/RMB)', () => {
    it('parses ICBC / CCB format CSV with Chinese headers', async () => {
      const csvData = [
        '交易日期,交易说明,支出,收入,余额',
        '2026-03-05,华为云技术服务费,¥ 5400.00,,¥ 94600.00',
        '2026-03-10,收到北京客户货款发票INV-CN-88,,¥ 25000.00,¥ 119600.00',
        '2026-03-20,办公室物业租金,¥ 8000.00,,¥ 111600.00',
      ].join('\n');

      const result = await csvParser.parse(csvData);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0]?.description).toBe('华为云技术服务费');
      expect(result.transactions[0]?.amountCents).toBe(-540000n);
      expect(result.transactions[1]?.amountCents).toBe(2500000n);
      expect(result.transactions[2]?.amountCents).toBe(-800000n);
    });

    it('parses Chinese PDF statement with 账单周期 & ¥ amounts', async () => {
      const pdfText = [
        '%PDF-1.4',
        '中国工商银行 电子对账单',
        '账单周期: 2026-03-01 至 2026-03-31',
        '期初余额: ¥ 50,000.00',
        '期末余额: ¥ 68,000.00',
        '',
        '2026-03-08 | 收到上海贸易货款发票 FP-9912 | ¥ 28,000.00',
        '2026-03-15 | 腾讯云服务器年费续费 | -¥ 6,000.00',
        '2026-03-28 | 员工三月份薪资打卡发放 | -¥ 4,000.00',
        '%%EOF',
      ].join('\n');

      const result = await pdfParser.parse(Buffer.from(pdfText, 'utf-8'));
      expect(result.startDate).toBe('2026-03-01');
      expect(result.endDate).toBe('2026-03-31');
      expect(result.openingBalanceCents).toBe(5000000n);
      expect(result.closingBalanceCents).toBe(6800000n);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0]?.description).toContain('FP-9912');
      expect(result.transactions[0]?.amountCents).toBe(2800000n);
      expect(result.transactions[1]?.amountCents).toBe(-600000n);
    });
  });
});
