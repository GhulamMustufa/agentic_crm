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
  const clean = val.replace(/[$,\s]/g, '').trim();
  if (clean === '') {
    return 0n;
  }

  // Check accounting parenthesis for negative: (100.50) -> -10050
  const isParenNegative = clean.startsWith('(') && clean.endsWith(')');
  const unsigned = isParenNegative ? clean.slice(1, -1) : clean;
  const isMinusNegative = unsigned.startsWith('-');
  const numStr = isMinusNegative ? unsigned.slice(1) : unsigned;

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
  // Format MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    if (m && d && y) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
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
    `Invalid date format in statement: '${dateStr}'. Expected YYYY-MM-DD or MM/DD/YYYY`,
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
      (h) => h === 'date' || h === 'tx_date' || h === 'transaction date',
    );
    const descColIdx = headers.findIndex(
      (h) => h === 'description' || h === 'payee' || h === 'memo' || h === 'narrative',
    );
    const amountColIdx = headers.findIndex((h) => h === 'amount');
    const debitColIdx = headers.findIndex((h) => h === 'debit' || h === 'withdrawal');
    const creditColIdx = headers.findIndex((h) => h === 'credit' || h === 'deposit');
    const refColIdx = headers.findIndex(
      (h) => h === 'reference' || h === 'ref' || h === 'check_number',
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
