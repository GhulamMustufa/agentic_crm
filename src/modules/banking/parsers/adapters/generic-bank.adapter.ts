import { Injectable } from '@nestjs/common';

import { normalizeDate, parseMonetaryCents } from '../csv-statement.parser';

import type { IBankStatementAdapter } from './bank-adapter.interface';
import type {
  BankCode,
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../layout/layout.types';
import type { ParsedStatementResult, ParsedTransactionLine } from '../statement-parser.interface';

@Injectable()
export class GenericBankAdapter implements IBankStatementAdapter {
  readonly bankCode: BankCode = 'UNKNOWN';
  readonly adapterVersion = '1.0.0-generic';

  supports(_inspection: DocumentInspectionResult): boolean {
    // Acts as universal fallback when no specialized bank adapter matches
    return true;
  }

  async parse(
    layout: StructuredDocumentLayout,
    inspection: DocumentInspectionResult,
  ): Promise<ParsedStatementResult> {
    const fullText = layout.pages.map((p) => p.rawText).join('\n');

    // 1. Extract Period
    const periodMatch =
      fullText.match(
        /(?:Statement Period|Period|Tempoh Penyata|Tempoh|账单周期|对账周期|起止日期):\s*(\S+)\s*(?:to|-|hingga|至)\s*(\S+)/i,
      ) ||
      fullText.match(/Statement Period:\s*(\S+)\s*(?:to|-)\s*(\S+)/i) ||
      fullText.match(/Period:\s*(\S+)\s*(?:to|-)\s*(\S+)/i);

    let startDate = '';
    let endDate = '';
    if (periodMatch?.[1] && periodMatch[2]) {
      try {
        startDate = normalizeDate(periodMatch[1]);
        endDate = normalizeDate(periodMatch[2]);
      } catch {
        // Fall back to transaction date bounds
      }
    }

    // 2. Extract Balances
    const openingMatch =
      fullText.match(
        /(?:Starting|Opening|Beginning|Baki Awal|Baki Pembukaan|期初|起始)\s*(?:Balance|Baki|余额)?:\s*([^\r\n]+)/i,
      ) || fullText.match(/(?:Starting|Opening|Beginning)\s+Balance:\s*([^\r\n]+)/i);
    const closingMatch =
      fullText.match(
        /(?:Ending|Closing|Baki Akhir|Baki Penutup|期末|截止)\s*(?:Balance|Baki|余额)?:\s*([^\r\n]+)/i,
      ) || fullText.match(/(?:Ending|Closing)\s+Balance:\s*([^\r\n]+)/i);

    let openingBalanceCents = 0n;
    let closingBalanceCents = 0n;
    if (openingMatch?.[1]) {
      openingBalanceCents = parseMonetaryCents(openingMatch[1]);
    }
    if (closingMatch?.[1]) {
      closingBalanceCents = parseMonetaryCents(closingMatch[1]);
    }

    // 3. Extract Transactions across layout pages
    const transactions: ParsedTransactionLine[] = [];
    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;
    let seq = 1;

    for (const page of layout.pages) {
      for (const line of page.tableLines) {
        // Option A: Pipe-delimited row
        if (line.includes('|')) {
          const parts = line.split('|').map((p) => p.trim());
          const datePart = parts[0] ?? '';
          const isDate =
            /^\d{4}-\d{2}-\d{2}$/.test(datePart) ||
            /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(datePart);

          if (isDate && parts.length === 5) {
            // Date | Description | Debit | Credit | Balance
            const [rawDate, desc, rawDebit, rawCredit, rawBal] = parts;
            const debitVal =
              rawDebit && rawDebit !== '-' ? this.safeParseMonetaryCents(rawDebit) : 0n;
            const creditVal =
              rawCredit && rawCredit !== '-' ? this.safeParseMonetaryCents(rawCredit) : 0n;
            const amt = debitVal > 0n ? -debitVal : creditVal;

            if (amt !== 0n) {
              if (amt < 0n) {
                totalDebitsCents += -amt;
              } else {
                totalCreditsCents += amt;
              }

              transactions.push({
                date: normalizeDate(rawDate!),
                amountCents: amt,
                signedAmountCents: amt,
                direction: amt < 0n ? 'DEBIT' : 'CREDIT',
                runningBalanceCents: rawBal ? this.safeParseMonetaryCents(rawBal) : undefined,
                description: desc!.trim(),
                pageNumber: page.pageNumber,
                sourceSequence: seq++,
                rawPrimaryText: line,
                extractionMethod: 'DETERMINISTIC_LAYOUT',
                extractionConfidence: 0.95,
              });
              continue;
            }
          } else if (isDate && parts.length === 6) {
            // Date | Description | Cheque/Ref | Debit | Credit | Balance
            const [rawDate, desc, ref, rawDebit, rawCredit, rawBal] = parts;
            const debitVal =
              rawDebit && rawDebit !== '-' ? this.safeParseMonetaryCents(rawDebit) : 0n;
            const creditVal =
              rawCredit && rawCredit !== '-' ? this.safeParseMonetaryCents(rawCredit) : 0n;
            const amt = debitVal > 0n ? -debitVal : creditVal;

            if (amt !== 0n) {
              if (amt < 0n) {
                totalDebitsCents += -amt;
              } else {
                totalCreditsCents += amt;
              }

              transactions.push({
                date: normalizeDate(rawDate!),
                amountCents: amt,
                signedAmountCents: amt,
                direction: amt < 0n ? 'DEBIT' : 'CREDIT',
                runningBalanceCents: rawBal ? this.safeParseMonetaryCents(rawBal) : undefined,
                description: desc!.trim(),
                referenceNumber: ref && ref !== '-' ? ref : undefined,
                bankReference: ref && ref !== '-' ? ref : undefined,
                pageNumber: page.pageNumber,
                sourceSequence: seq++,
                rawPrimaryText: line,
                extractionMethod: 'DETERMINISTIC_LAYOUT',
                extractionConfidence: 0.95,
              });
              continue;
            }
          }
        }

        // Option B: Dual-amount column variant (Date Description Debit Credit Balance)
        const dualMatch = line.match(
          /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([0-9,]*\.?\d{2}|-)\s+([0-9,]*\.?\d{2}|-)\s+([0-9,]*\.?\d{2})$/,
        );
        if (dualMatch?.[1] && dualMatch[2] && dualMatch[3] && dualMatch[4] && dualMatch[5]) {
          const rawDebit = dualMatch[3];
          const rawCredit = dualMatch[4];
          const rawBal = dualMatch[5];
          const debitVal = rawDebit !== '-' ? this.safeParseMonetaryCents(rawDebit) : 0n;
          const creditVal = rawCredit !== '-' ? this.safeParseMonetaryCents(rawCredit) : 0n;
          const amt = debitVal > 0n ? -debitVal : creditVal;

          if (amt !== 0n) {
            if (amt < 0n) {
              totalDebitsCents += -amt;
            } else {
              totalCreditsCents += amt;
            }

            transactions.push({
              date: normalizeDate(dualMatch[1]),
              amountCents: amt,
              signedAmountCents: amt,
              direction: amt < 0n ? 'DEBIT' : 'CREDIT',
              runningBalanceCents: this.safeParseMonetaryCents(rawBal),
              description: dualMatch[2].trim(),
              pageNumber: page.pageNumber,
              sourceSequence: seq++,
              rawPrimaryText: line,
              extractionMethod: 'DETERMINISTIC_LAYOUT',
              extractionConfidence: 0.95,
            });
            continue;
          }
        }

        // Option C: Single-amount column match
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
                signedAmountCents: amountCents,
                direction: amountCents < 0n ? 'DEBIT' : 'CREDIT',
                description: desc.trim(),
                pageNumber: page.pageNumber,
                sourceSequence: seq++,
                rawPrimaryText: line,
                extractionMethod: 'DETERMINISTIC_LAYOUT',
                extractionConfidence: 0.95,
              });
            } catch {
              // Skip line
            }
          }
        }
      }
    }

    if (transactions.length > 0) {
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
    }

    // Bank identification
    const bankMatch =
      fullText.match(/(?:Bank|Institution|Bank Name):\s*([^\r\n]+)/i) ||
      fullText.match(/Maybank|Chase|JPMorgan|Mercury|Bank of America|Wells Fargo/i);
    const acctMatch = fullText.match(
      /(?:Account|A\/C)\s*(?:No|Number)?\s*[:.]?\s*.*?(\d{4})(?!\d)/i,
    );

    let bankName: string | undefined = undefined;
    if (bankMatch) {
      bankName = bankMatch[1] ? bankMatch[1].trim() : bankMatch[0].trim();
    }

    let accountNumberLast4: string | undefined = undefined;
    if (acctMatch?.[1]) {
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
      bankName:
        inspection.bankDisplayName !== 'Unknown Financial Institution'
          ? inspection.bankDisplayName
          : bankName,
      accountNumberLast4: inspection.accountNumber
        ? inspection.accountNumber.slice(-4)
        : accountNumberLast4,
      accountType: 'CHECKING',
      pageCount: layout.pageCount,
      extractionMode: inspection.suggestedMode,
      bankDetected: inspection.detectedBank,
      formatDetected: inspection.detectedFormat,
      parserVersion: this.adapterVersion,
      metadata: {
        detectedBank: inspection.detectedBank,
        bankDisplayName: inspection.bankDisplayName,
        adapterVersion: this.adapterVersion,
        confidence: inspection.confidence,
        totalCharacters: layout.totalCharacters,
        reasons: inspection.reasons,
      },
    };
  }

  private safeParseMonetaryCents(val: string): bigint {
    try {
      return parseMonetaryCents(val);
    } catch {
      return 0n;
    }
  }
}
