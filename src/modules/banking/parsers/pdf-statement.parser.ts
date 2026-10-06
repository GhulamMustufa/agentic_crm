import { Injectable } from '@nestjs/common';

import { parseMonetaryCents, normalizeDate } from './csv-statement.parser';
import { ValidationError } from '../../../core/errors/app-error';

import type {
  IStatementParser,
  ParsedStatementResult,
  ParsedTransactionLine,
} from './statement-parser.interface';

export class MalformedPdfError extends ValidationError {
  constructor(reason: string) {
    super(`Malformed PDF statement: ${reason}`);
    this.name = 'MalformedPdfError';
  }
}

@Injectable()
export class PdfStatementParser implements IStatementParser {
  async parse(content: string | Buffer): Promise<ParsedStatementResult> {
    const rawBuffer = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, content.startsWith('%PDF') ? 'utf-8' : 'base64');

    const rawStr = rawBuffer.toString('binary');

    // 1. PDF Header and EOF verification
    if (!rawStr.includes('%PDF-')) {
      throw new MalformedPdfError('Missing %PDF- header magic bytes');
    }
    if (!rawStr.includes('%%EOF') && !rawStr.includes('trailer')) {
      throw new MalformedPdfError('Truncated or corrupted PDF: missing EOF trailer marker');
    }

    // Convert to readable text
    const text = rawBuffer.toString('utf-8');

    // 2. Extract Statement Period (English, Malay, Chinese)
    const periodMatch =
      text.match(
        /(?:Statement Period|Period|Tempoh Penyata|Tempoh|账单周期|对账周期|起止日期):\s*(\S+)\s*(?:to|-|hingga|至)\s*(\S+)/i,
      ) ||
      text.match(/Statement Period:\s*(\S+)\s*(?:to|-)\s*(\S+)/i) ||
      text.match(/Period:\s*(\S+)\s*(?:to|-)\s*(\S+)/i);

    let startDate = '';
    let endDate = '';
    if (periodMatch && periodMatch[1] && periodMatch[2]) {
      try {
        startDate = normalizeDate(periodMatch[1]);
        endDate = normalizeDate(periodMatch[2]);
      } catch {
        // Fall back to transaction date bounds if needed
      }
    }

    // 3. Extract Starting and Ending Balances (English, Malay, Chinese)
    const openingMatch =
      text.match(
        /(?:Starting|Opening|Beginning|Baki Awal|Baki Pembukaan|期初|起始)\s*(?:Balance|Baki|余额)?:\s*([^\r\n]+)/i,
      ) || text.match(/(?:Starting|Opening|Beginning)\s+Balance:\s*([^\r\n]+)/i);
    const closingMatch =
      text.match(
        /(?:Ending|Closing|Baki Akhir|Baki Penutup|期末|截止)\s*(?:Balance|Baki|余额)?:\s*([^\r\n]+)/i,
      ) || text.match(/(?:Ending|Closing)\s+Balance:\s*([^\r\n]+)/i);

    let openingBalanceCents = 0n;
    let closingBalanceCents = 0n;
    if (openingMatch && openingMatch[1]) {
      openingBalanceCents = parseMonetaryCents(openingMatch[1]);
    }
    if (closingMatch && closingMatch[1]) {
      closingBalanceCents = parseMonetaryCents(closingMatch[1]);
    }

    // 4. Extract Transactions
    // Look for lines formatted with Date, Description, and Monetary Amount
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const transactions: ParsedTransactionLine[] = [];
    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;

    for (const line of lines) {
      // Matches: YYYY-MM-DD, DD/MM/YYYY, YYYY.MM.DD, or YYYY年MM月DD日
      // Amount with -, +, $, RM, MYR, ¥, RMB, CNY, etc.
      const match =
        line.match(
          /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}\.\d{2}\.\d{2}|\d{4}年\d{1,2}月\d{1,2}日?)\s+(?:\|\s+)?(.+?)\s+(?:\|\s+)?([-$+]*\(?(?:[$¥€£]|RM|MYR|CNY|RMB|SGD)?\s*[\d,]+(?:\.\d{2})?\)?[-\s]*(?:DR|CR)?)$/i,
        ) ||
        line.match(
          /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}\.\d{2}\.\d{2}|\d{4}年\d{1,2}月\d{1,2}日?)\s{2,}(.+?)\s{2,}([-$+]*\(?(?:[$¥€£]|RM|MYR|CNY|RMB|SGD)?\s*[\d,]+(?:\.\d{2})?\)?[-\s]*(?:DR|CR)?)$/i,
        );

      if (match) {
        const [, rawDate, desc, rawAmount] = match;
        if (rawDate && desc && rawAmount) {
          try {
            const date = normalizeDate(rawDate);
            const amountCents = parseMonetaryCents(rawAmount);

            if (amountCents === 0n) {
              continue;
            }

            if (amountCents < 0n) {
              totalDebitsCents += -amountCents;
            } else {
              totalCreditsCents += amountCents;
            }

            transactions.push({
              date,
              amountCents,
              description: desc.trim(),
            });
          } catch {
            // Skip unparseable line
          }
        }
      }
    }

    if (transactions.length === 0) {
      throw new ValidationError(
        'PDF extraction uncertain: zero transaction lines could be reliably identified in statement',
      );
    }

    transactions.sort((a, b) => a.date.localeCompare(b.date));

    const firstTx = transactions[0];
    const lastTx = transactions[transactions.length - 1];
    if (firstTx && !startDate) {
      startDate = firstTx.date;
    }
    if (lastTx && !endDate) {
      endDate = lastTx.date;
    }

    if (!closingMatch) {
      closingBalanceCents = openingBalanceCents + totalCreditsCents - totalDebitsCents;
    }

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
