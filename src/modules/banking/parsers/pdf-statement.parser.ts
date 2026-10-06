import { Injectable } from '@nestjs/common';
import * as pdfParseModule from 'pdf-parse';

import { AiStatementParser } from './ai-statement.parser';
import { parseMonetaryCents, normalizeDate } from './csv-statement.parser';
import { ValidationError } from '../../../core/errors/app-error';

import type {
  IStatementParser,
  ParsedStatementResult,
  ParsedTransactionLine,
} from './statement-parser.interface';

export async function extractTextFromPdfBuffer(rawBuffer: Buffer): Promise<string> {
  try {
    const mod = pdfParseModule as unknown as Record<string, unknown>;
    if (mod && typeof mod.PDFParse === 'function') {
      const PDFParse = mod.PDFParse as new (data: Uint8Array) => {
        getText: () => Promise<unknown>;
      };
      const instance = new PDFParse(new Uint8Array(rawBuffer));
      const res = await instance.getText();
      if (typeof res === 'string') {
        return res;
      }
      if (res && typeof (res as { text?: string }).text === 'string') {
        return (res as { text: string }).text;
      }
    }
    if (typeof mod === 'function') {
      const res = await (mod as (buf: Buffer) => Promise<{ text?: string }>)(rawBuffer);
      if (res && typeof res.text === 'string') {
        return res.text;
      }
    }
  } catch (err) {
    console.warn('PDF text extraction error:', err);
  }
  return rawBuffer.toString('utf-8');
}

export class MalformedPdfError extends ValidationError {
  constructor(reason: string) {
    super(`Malformed PDF statement: ${reason}`);
    this.name = 'MalformedPdfError';
  }
}

@Injectable()
export class PdfStatementParser implements IStatementParser {
  constructor(private readonly aiParser: AiStatementParser) {}

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

    // Convert to readable text using robust pdf-parse helper
    const text = await extractTextFromPdfBuffer(rawBuffer);

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
      // Matches: YYYY-MM-DD, DD/MM/YYYY, DD/MM, YYYY.MM.DD, or YYYY年MM月DD日
      // Amount with -, +, $, RM, MYR, ¥, RMB, CNY, etc.
      const match =
        line.match(
          /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}\.\d{2}\.\d{2}|\d{4}年\d{1,2}月\d{1,2}日?)\s+(?:\|\s+)?(.+?)\s+(?:\|\s+)?([-$+]*\(?(?:[$¥€£]|RM|MYR|CNY|RMB|SGD)?\s*[\d,]+(?:\.\d{2})?\)?[-\s+]*\+?(?:DR|CR)?)(?:\s+[\d,]+(?:\.\d{2})?)?$/i,
        ) ||
        line.match(
          /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}\.\d{2}\.\d{2}|\d{4}年\d{1,2}月\d{1,2}日?)\s{2,}(.+?)\s{2,}([-$+]*\(?(?:[$¥€£]|RM|MYR|CNY|RMB|SGD)?\s*[\d,]+(?:\.\d{2})?\)?[-\s+]*\+?(?:DR|CR)?)(?:\s+[\d,]+(?:\.\d{2})?)?$/i,
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
      return this.aiParser.parse(content);
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

    // 6. Extract Bank Name and Account Number (Simple Heuristic for Simulation)
    const bankMatch =
      text.match(/(?:Bank|Institution|Bank Name):\s*([^\r\n]+)/i) ||
      text.match(/Maybank|Chase|JPMorgan|Mercury|Bank of America|Wells Fargo/i);
    const acctMatch = text.match(/(?:Account|A\/C)\s*(?:No|Number)?\s*[:.]?\s*.*?(\d{4})(?!\d)/i);

    let bankName: string | undefined = undefined;
    if (bankMatch) {
      bankName = bankMatch[1] ? bankMatch[1].trim() : bankMatch[0].trim();
    }

    let accountNumberLast4: string | undefined = undefined;
    if (acctMatch && acctMatch[1]) {
      accountNumberLast4 = acctMatch[1];
    }

    return {
      startDate,
      endDate,
      openingBalanceCents,
      closingBalanceCents,
      totalDebitsCents,
      totalCreditsCents,
      transactions,
      bankName,
      accountNumberLast4,
      accountType: 'CHECKING',
    };
  }
}
