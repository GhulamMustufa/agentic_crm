import { Injectable } from '@nestjs/common';

import { ValidationError } from '../../../core/errors/app-error';

import type {
  IStatementParser,
  ParsedStatementResult,
  ParsedTransactionLine,
} from './statement-parser.interface';

export function parseMonetaryCents(val: string): bigint {
  if (!val || val.trim() === '') {
    return 0n;
  }
  // Strip currency symbols: $, RM, MYR, ¥, RMB, CNY, SGD, EUR, GBP, 元, etc.
  let clean = val.replace(/[$¥€£元]|(?:MYR|RMB|RM|CNY|SGD|USD)\.?/gi, '').trim();
  clean = clean.replace(/[,\s]/g, '').trim();
  if (clean === '') {
    return 0n;
  }

  // Check accounting parenthesis for negative: (100.50) -> -10050
  const isParenNegative = clean.startsWith('(') && clean.endsWith(')');
  let unsigned = isParenNegative ? clean.slice(1, -1) : clean;
  // Check trailing minus or DR: e.g. 100.50- or 100.50DR
  const isMinusNegative =
    unsigned.startsWith('-') || unsigned.endsWith('-') || unsigned.toUpperCase().endsWith('DR');
  if (unsigned.endsWith('-') || unsigned.endsWith('+')) {
    unsigned = unsigned.slice(0, -1);
  } else if (unsigned.toUpperCase().endsWith('DR')) {
    unsigned = unsigned.slice(0, -2);
  } else if (unsigned.toUpperCase().endsWith('CR')) {
    unsigned = unsigned.slice(0, -2);
  }
  let numStr = isMinusNegative
    ? unsigned.startsWith('-')
      ? unsigned.slice(1)
      : unsigned
    : unsigned;

  if (numStr.startsWith('.')) {
    numStr = '0' + numStr;
  }

  if (!/^\d+(\.\d+)?$/.test(numStr)) {
    throw new ValidationError(`Invalid monetary amount format: '${val}'`);
  }

  const parts = numStr.split('.');
  const whole = BigInt(parts[0] || '0');
  const fracStr = (parts[1] || '').padEnd(2, '0').slice(0, 2);
  const fraction = BigInt(fracStr);

  const totalCents = whole * 100n + fraction;
  return isParenNegative || isMinusNegative ? -totalCents : totalCents;
}

export function normalizeDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  // Format DD/MM without year (e.g. 01/06)
  const dmMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dmMatch && dmMatch[1] && dmMatch[2]) {
    return `2026-${dmMatch[2].padStart(2, '0')}-${dmMatch[1].padStart(2, '0')}`;
  }
  // Format Chinese: YYYY年MM月DD日 or YYYY年M月D日
  const cnMatch = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (cnMatch) {
    const [, y, m, d] = cnMatch;
    if (y && m && d) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  // Format YYYY.MM.DD
  const dotMatch = trimmed.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) {
    const [, y, m, d] = dotMatch;
    if (y && m && d) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  // Format YYYY/MM/DD
  const slashYmdMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashYmdMatch) {
    const [, y, m, d] = slashYmdMatch;
    if (y && m && d) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  // Format DD/MM/YYYY or MM/DD/YYYY or D/M/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, p1, p2, y] = slashMatch;
    if (p1 && p2 && y) {
      const n1 = parseInt(p1, 10);
      const n2 = parseInt(p2, 10);
      // If first number > 12, it is definitely DD/MM/YYYY (e.g. 25/03/2026)
      if (n1 > 12) {
        return `${y}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      }
      // If second number > 12, it is MM/DD/YYYY (e.g. 03/25/2026)
      if (n2 > 12) {
        return `${y}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
      }
      // Default to Commonwealth / Malaysian DD/MM/YYYY when both are <= 12
      return `${y}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
    }
  }
  // Format DD-MM-YYYY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, d, m, y] = dashMatch;
    if (d && m && y) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  throw new ValidationError(
    `Invalid date format in statement: '${dateStr}'. Expected YYYY-MM-DD, DD/MM/YYYY, or YYYY年MM月DD日`,
  );
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

@Injectable()
export class CsvStatementParser implements IStatementParser {
  async parse(content: string | Buffer): Promise<ParsedStatementResult> {
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lines.length < 2) {
      throw new ValidationError('CSV statement is empty or missing headers');
    }

    // 1. Identify columns from header row
    const headerLine = lines[0];
    if (!headerLine) {
      throw new ValidationError('CSV statement has empty header row');
    }
    const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().replace(/['"]/g, ''));

    const dateColIdx = headers.findIndex(
      (h) =>
        h === 'date' ||
        h === 'tx_date' ||
        h === 'transaction date' ||
        h === 'tarikh' ||
        h === 'tarikh transaksi' ||
        h === '日期' ||
        h === '交易日期' ||
        h === '时间' ||
        h === '交易时间',
    );
    const descColIdx = headers.findIndex(
      (h) =>
        h === 'description' ||
        h === 'payee' ||
        h === 'memo' ||
        h === 'narrative' ||
        h === 'butiran' ||
        h === 'keterangan' ||
        h === 'deskripsi' ||
        h === 'huraian' ||
        h === '描述' ||
        h === '摘要' ||
        h === '交易说明' ||
        h === '对方户名' ||
        h === '交易方' ||
        h === '详情',
    );
    const amountColIdx = headers.findIndex(
      (h) => h === 'amount' || h === 'amaun' || h === 'jumlah' || h === '金额' || h === '交易金额',
    );
    const debitColIdx = headers.findIndex(
      (h) =>
        h === 'debit' ||
        h === 'withdrawal' ||
        h === 'wang keluar' ||
        h === 'keluar' ||
        h === 'pengeluaran' ||
        h === '支出' ||
        h === '借' ||
        h === '出账' ||
        h === '扣款' ||
        h.includes('debit') ||
        h.includes('wang keluar') ||
        h.includes('支出'),
    );
    const creditColIdx = headers.findIndex(
      (h) =>
        h === 'credit' ||
        h === 'deposit' ||
        h === 'wang masuk' ||
        h === 'masuk' ||
        h === '收入' ||
        h === '贷' ||
        h === '入账' ||
        h === '存款' ||
        h.includes('credit') ||
        h.includes('wang masuk') ||
        h.includes('收入'),
    );
    const refColIdx = headers.findIndex(
      (h) =>
        h === 'reference' ||
        h === 'ref' ||
        h === 'check_number' ||
        h === 'rujukan' ||
        h === 'no rujukan' ||
        h === 'no cek' ||
        h === '参考号' ||
        h === '流水号' ||
        h === '交易单号' ||
        h === '凭证号',
    );

    if (dateColIdx === -1) {
      throw new ValidationError("Missing required 'Date' column in CSV statement");
    }
    if (descColIdx === -1) {
      throw new ValidationError("Missing required 'Description' column in CSV statement");
    }
    if (amountColIdx === -1 && debitColIdx === -1 && creditColIdx === -1) {
      throw new ValidationError(
        "Missing required 'Amount' (or Debit/Credit) column in CSV statement",
      );
    }

    const transactions: ParsedTransactionLine[] = [];
    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }
      const row = parseCsvLine(line);
      if (row.length <= Math.max(dateColIdx, descColIdx)) {
        continue; // Empty or incomplete line
      }

      const rawDate = row[dateColIdx];
      const description = row[descColIdx];
      if (!rawDate || !description) {
        throw new ValidationError(`Row ${i + 1} has missing required date or description fields`);
      }

      const parsedDate = normalizeDate(rawDate);

      let amountCents = 0n;
      if (amountColIdx !== -1 && row[amountColIdx] !== undefined && row[amountColIdx] !== '') {
        amountCents = parseMonetaryCents(row[amountColIdx] as string);
      } else {
        const debitStr = debitColIdx !== -1 ? row[debitColIdx] || '' : '';
        const creditStr = creditColIdx !== -1 ? row[creditColIdx] || '' : '';
        const debitCents = parseMonetaryCents(debitStr);
        const creditCents = parseMonetaryCents(creditStr);
        if (debitCents > 0n) {
          amountCents = -debitCents;
        } else if (creditCents > 0n) {
          amountCents = creditCents;
        }
      }

      if (amountCents === 0n) {
        throw new ValidationError(`Row ${i + 1} has zero or missing monetary amount`);
      }

      if (amountCents < 0n) {
        totalDebitsCents += -amountCents;
      } else {
        totalCreditsCents += amountCents;
      }

      const referenceNumber = refColIdx !== -1 && row[refColIdx] ? row[refColIdx] : undefined;

      transactions.push({
        date: parsedDate,
        amountCents,
        description,
        referenceNumber,
      });
    }

    if (transactions.length === 0) {
      throw new ValidationError('CSV statement contained no valid transaction rows');
    }

    // Sort by date ascending
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    const firstTx = transactions[0];
    const lastTx = transactions[transactions.length - 1];
    if (!firstTx || !lastTx) {
      throw new ValidationError('Failed to extract date boundaries from CSV transactions');
    }

    const startDate = firstTx.date;
    const endDate = lastTx.date;

    // For statement balance: Net change = totalCredits - totalDebits
    const openingBalanceCents = 0n; // Default if not explicitly present in CSV header
    const closingBalanceCents = openingBalanceCents + totalCreditsCents - totalDebitsCents;

    return {
      startDate,
      endDate,
      openingBalanceCents,
      closingBalanceCents,
      totalDebitsCents,
      totalCreditsCents,
      transactions,
    };
  }
}
