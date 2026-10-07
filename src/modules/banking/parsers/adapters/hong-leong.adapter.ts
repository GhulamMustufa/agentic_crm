import { Injectable } from '@nestjs/common';

import { normalizeDate, parseMonetaryCents } from '../csv-statement.parser';

import type { IBankStatementAdapter } from './bank-adapter.interface';
import type {
  BankCode,
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../layout/layout.types';
import type { ParsedStatementResult, ParsedTransactionLine } from '../statement-parser.interface';

interface ActiveHongLeongTransaction {
  sourceSequence: number;
  pageNumber: number;
  date: string;
  valueDate?: string;
  direction: 'DEBIT' | 'CREDIT';
  amountCents: bigint;
  runningBalanceCents?: bigint;
  primaryDescription: string;
  continuationLines: string[];
  bankReference?: string;
  rawPrimaryText: string;
}

@Injectable()
export class HongLeongAdapter implements IBankStatementAdapter {
  readonly bankCode: BankCode = 'HONG_LEONG';
  readonly adapterVersion = '2.0.0-hlb-statement';

  supports(inspection: DocumentInspectionResult): boolean {
    return (
      inspection.detectedBank === 'HONG_LEONG' ||
      inspection.detectedFormat === 'HONG_LEONG_STATEMENT' ||
      /hong\s*leong/i.test(inspection.bankDisplayName)
    );
  }

  async parse(
    layout: StructuredDocumentLayout,
    inspection: DocumentInspectionResult,
  ): Promise<ParsedStatementResult> {
    const fullText = layout.pages.map((p) => p.rawText).join('\n');

    // 1. Extract Period
    const { startDate, endDate } = this.extractStatementPeriod(fullText, inspection.statementDate);

    // 2. Extract Balances
    const openingBalanceCents = this.extractOpeningBalance(fullText);
    const explicitClosing = this.extractClosingBalance(fullText);

    // 3. Multi-line transaction state machine
    const transactions: ParsedTransactionLine[] = [];
    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;
    let sequenceCounter = 1;
    let activeTx: ActiveHongLeongTransaction | null = null;
    let lastRunningBalance: bigint | undefined = undefined;

    for (const page of layout.pages) {
      for (const rawLine of page.tableLines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        if (this.isHeaderOrDividerLine(line)) {
          continue;
        }

        if (/BALANCE\s*B\/F|BAKI\s*DIBAWA\s*KE\s*HADAPAN|OPENING\s*BALANCE/i.test(line)) {
          continue;
        }

        const match = this.matchPrimaryTransactionLine(line, lastRunningBalance);

        if (match) {
          if (activeTx) {
            const finalized = this.finalizeTransaction(activeTx);
            transactions.push(finalized);
            if (finalized.amountCents < 0n) {
              totalDebitsCents += -finalized.amountCents;
            } else {
              totalCreditsCents += finalized.amountCents;
            }
            if (finalized.runningBalanceCents !== undefined) {
              lastRunningBalance = finalized.runningBalanceCents;
            }
          }

          const runningBalanceCents = match.rawBalance
            ? this.safeParseMonetaryCents(match.rawBalance)
            : undefined;

          activeTx = {
            sourceSequence: sequenceCounter++,
            pageNumber: page.pageNumber,
            date: normalizeDate(match.entryDate),
            valueDate: match.valueDate ? normalizeDate(match.valueDate) : undefined,
            direction: match.direction,
            amountCents: match.amountCents,
            runningBalanceCents,
            primaryDescription: match.description.trim(),
            continuationLines: [],
            rawPrimaryText: line,
            bankReference: match.bankReference,
          };
        } else if (activeTx) {
          if (this.isFooterNoise(line)) {
            continue;
          }

          activeTx.continuationLines.push(line);

          // Extract Hong Leong references
          const refMatch =
            line.match(/(?:REF|NO\.\s*RUJUKAN|HLB)\s*[:.\s]*(\S+)/i) ||
            line.match(/\b(\d{12,18})\b/);
          if (refMatch?.[1] && !activeTx.bankReference) {
            activeTx.bankReference = refMatch[1];
          }
        }
      }
    }

    if (activeTx) {
      const finalized = this.finalizeTransaction(activeTx);
      transactions.push(finalized);
      if (finalized.amountCents < 0n) {
        totalDebitsCents += -finalized.amountCents;
      } else {
        totalCreditsCents += finalized.amountCents;
      }
      if (finalized.runningBalanceCents !== undefined) {
        lastRunningBalance = finalized.runningBalanceCents;
      }
    }

    // Determine closing balance
    let closingBalanceCents = 0n;
    if (explicitClosing !== undefined) {
      closingBalanceCents = explicitClosing;
    } else if (lastRunningBalance !== undefined) {
      closingBalanceCents = lastRunningBalance;
    } else {
      closingBalanceCents = openingBalanceCents + totalCreditsCents - totalDebitsCents;
    }

    let finalStartDate = startDate;
    let finalEndDate = endDate;
    if (transactions.length > 0) {
      if (!finalStartDate && transactions[0]?.date) {
        finalStartDate = transactions[0].date;
      }
      if (!finalEndDate && transactions[transactions.length - 1]?.date) {
        finalEndDate = transactions[transactions.length - 1]!.date;
      }
    }

    return {
      startDate: finalStartDate,
      endDate: finalEndDate,
      openingBalanceCents,
      closingBalanceCents,
      totalDebitsCents,
      totalCreditsCents,
      transactions,
      bankName:
        inspection.bankDisplayName !== 'Unknown Financial Institution'
          ? inspection.bankDisplayName
          : 'Hong Leong Bank Berhad',
      accountNumberLast4: inspection.accountNumber ? inspection.accountNumber.slice(-4) : undefined,
      accountType: 'CHECKING',
      pageCount: layout.pageCount,
      extractionMode: inspection.suggestedMode,
      bankDetected: 'HONG_LEONG',
      formatDetected: 'HONG_LEONG_STATEMENT',
      parserVersion: this.adapterVersion,
      metadata: {
        detectedBank: 'HONG_LEONG',
        adapterVersion: this.adapterVersion,
        totalExtracted: transactions.length,
        hasContinuousBalance: lastRunningBalance !== undefined,
      },
    };
  }

  private matchPrimaryTransactionLine(
    line: string,
    lastBalance?: bigint,
  ): {
    entryDate: string;
    valueDate?: string;
    description: string;
    amountCents: bigint;
    direction: 'DEBIT' | 'CREDIT';
    rawBalance?: string;
    bankReference?: string;
  } | null {
    // 1. Pipe-delimited variant (only if line contains pipe characters)
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      const datePart = parts[0] ?? '';
      const isDate =
        /^\d{4}-\d{2}-\d{2}$/.test(datePart) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(datePart);

      if (isDate && parts.length === 5) {
        // 5 columns: Date | Description | Withdrawals (DR) | Deposits (CR) | Balance
        const [entryDate, desc, rawDebit, rawCredit, rawBal] = parts;
        const debitVal = rawDebit && rawDebit !== '-' ? this.safeParseMonetaryCents(rawDebit) : 0n;
        const creditVal =
          rawCredit && rawCredit !== '-' ? this.safeParseMonetaryCents(rawCredit) : 0n;

        if (debitVal > 0n && creditVal === 0n) {
          return {
            entryDate: entryDate!,
            description: desc!,
            amountCents: -debitVal,
            direction: 'DEBIT',
            rawBalance: rawBal,
          };
        } else if (creditVal > 0n && debitVal === 0n) {
          return {
            entryDate: entryDate!,
            description: desc!,
            amountCents: creditVal,
            direction: 'CREDIT',
            rawBalance: rawBal,
          };
        }
      } else if (isDate && (parts.length === 3 || parts.length === 4)) {
        const pipeRegex =
          /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s*\|\s*(.+?)\s*\|\s*([-$+]*\(?(?:RM|MYR)?\s*[\d,]*\.?\d{2}\)?[-\s+]*\+?(?:DR|CR)?)(?:\s*\|\s*([0-9,]*\.?\d{2}))?$/i;
        const pipeMatch = line.match(pipeRegex);
        if (pipeMatch?.[1] && pipeMatch[2] && pipeMatch[3]) {
          const rawAmt = pipeMatch[3];
          const rawBal = pipeMatch[4];
          const parsedAmt = parseMonetaryCents(rawAmt);
          const isDebit = parsedAmt < 0n || rawAmt.endsWith('-') || /DR/i.test(rawAmt);
          const absAmt = parsedAmt < 0n ? -parsedAmt : parsedAmt;

          return {
            entryDate: pipeMatch[1],
            description: pipeMatch[2],
            amountCents: isDebit ? -absAmt : absAmt,
            direction: isDebit ? 'DEBIT' : 'CREDIT',
            rawBalance: rawBal,
          };
        }
      }
    }

    // Dual-amount column variant: Date | Description | Debit | Credit | Balance
    const dualAmountRegex =
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([0-9,]*\.?\d{2}|-)\s+([0-9,]*\.?\d{2}|-)\s+([0-9,]*\.?\d{2})$/;
    const dualMatch = line.match(dualAmountRegex);
    if (dualMatch?.[1] && dualMatch[2] && dualMatch[3] && dualMatch[4] && dualMatch[5]) {
      const debitVal = dualMatch[3] !== '-' ? this.safeParseMonetaryCents(dualMatch[3]) : 0n;
      const creditVal = dualMatch[4] !== '-' ? this.safeParseMonetaryCents(dualMatch[4]) : 0n;

      if (debitVal > 0n && creditVal === 0n) {
        return {
          entryDate: dualMatch[1],
          description: dualMatch[2],
          amountCents: -debitVal,
          direction: 'DEBIT',
          rawBalance: dualMatch[5],
        };
      } else if (creditVal > 0n && debitVal === 0n) {
        return {
          entryDate: dualMatch[1],
          description: dualMatch[2],
          amountCents: creditVal,
          direction: 'CREDIT',
          rawBalance: dualMatch[5],
        };
      }
    }

    // Single amount + Balance variant
    const singleAmountRegex =
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([-$+]*[0-9,]*\.?\d{2}[-+DRdrCRcr]*)\s+([0-9,]*\.?\d{2})$/;
    const singleMatch = line.match(singleAmountRegex);
    if (singleMatch?.[1] && singleMatch[2] && singleMatch[3] && singleMatch[4]) {
      const rawAmt = singleMatch[3];
      const rawBal = singleMatch[4];
      const parsedAmt = parseMonetaryCents(rawAmt);
      const balVal = this.safeParseMonetaryCents(rawBal);

      let isDebit = false;
      if (rawAmt.endsWith('-') || rawAmt.startsWith('-') || /DR/i.test(rawAmt)) {
        isDebit = true;
      } else if (lastBalance !== undefined) {
        const delta = balVal - lastBalance;
        isDebit = delta < 0n;
      } else {
        isDebit = /PAYMENT|WITHDRAWAL|OUT|DEBIT|FEE|TRANSFER\s*TO/i.test(singleMatch[2]);
      }

      const absAmt =
        parsedAmt < 0n
          ? -parsedAmt
          : parsedAmt === 0n
            ? this.safeParseMonetaryCents(rawAmt)
            : parsedAmt;
      return {
        entryDate: singleMatch[1],
        description: singleMatch[2],
        amountCents: isDebit ? -absAmt : absAmt,
        direction: isDebit ? 'DEBIT' : 'CREDIT',
        rawBalance: rawBal,
      };
    }

    return null;
  }

  private finalizeTransaction(tx: ActiveHongLeongTransaction): ParsedTransactionLine {
    const continuationText = tx.continuationLines.join(' | ');
    let normalizedPayee: string | undefined = undefined;

    for (const cl of tx.continuationLines) {
      const match = cl.match(/(?:RECIPIENT|TO|KEPADA|BENEFICIARY)\s*[:.\s]*([^\r\n|]+)/i);
      if (match?.[1]) {
        normalizedPayee = match[1].trim();
        break;
      }
    }

    const fullDescription =
      tx.continuationLines.length > 0
        ? `${tx.primaryDescription} | ${continuationText}`
        : tx.primaryDescription;

    return {
      date: tx.date,
      valueDate: tx.valueDate,
      amountCents: tx.amountCents,
      signedAmountCents: tx.amountCents,
      direction: tx.direction,
      runningBalanceCents: tx.runningBalanceCents,
      description: fullDescription,
      rawPrimaryText: tx.rawPrimaryText,
      rawContinuationText: tx.continuationLines.length > 0 ? continuationText : undefined,
      bankReference: tx.bankReference,
      referenceNumber: tx.bankReference,
      pageNumber: tx.pageNumber,
      sourceSequence: tx.sourceSequence,
      extractionMethod: 'BANK_ADAPTER',
      extractionConfidence: 0.98,
      riskLevel: 'LOW',
      sourceEvidence: {
        payeeFound: normalizedPayee !== undefined,
        continuationLineCount: tx.continuationLines.length,
        hasReference: tx.bankReference !== undefined,
      },
    };
  }

  private extractStatementPeriod(
    text: string,
    statementDate?: string,
  ): { startDate: string; endDate: string } {
    const match = text.match(
      /(?:STATEMENT\s*PERIOD|PERIOD|TEMPOH\s*PENYATA|TEMPOH)\s*[:.\s]*(\S+)\s*(?:TO|-|HINGGA)\s*(\S+)/i,
    );
    if (match?.[1] && match[2]) {
      try {
        return {
          startDate: normalizeDate(match[1]),
          endDate: normalizeDate(match[2]),
        };
      } catch {
        // Fall back
      }
    }

    if (statementDate) {
      try {
        const normalized = normalizeDate(statementDate);
        const parts = normalized.split('-');
        if (parts.length === 3 && parts[0] && parts[1]) {
          return {
            startDate: `${parts[0]}-${parts[1]}-01`,
            endDate: normalized,
          };
        }
      } catch {
        // Fall back
      }
    }

    const currentYear = new Date().getFullYear();
    return {
      startDate: `${currentYear}-01-01`,
      endDate: `${currentYear}-12-31`,
    };
  }

  private extractOpeningBalance(text: string): bigint {
    const match = text.match(
      /(?:BALANCE\s*B\/F|BAKI\s*DIBAWA\s*KE\s*HADAPAN|OPENING\s*BALANCE|BEGINNING\s*BALANCE)\s*[:.\s]*([^\r\n]+)/i,
    );
    if (match?.[1]) {
      try {
        return parseMonetaryCents(match[1]);
      } catch {
        return 0n;
      }
    }
    return 0n;
  }

  private extractClosingBalance(text: string): bigint | undefined {
    const match = text.match(
      /(?:BALANCE\s*C\/F|BAKI\s*AKHIR|CLOSING\s*BALANCE|ENDING\s*BALANCE)\s*[:.\s]*([^\r\n]+)/i,
    );
    if (match?.[1]) {
      try {
        return parseMonetaryCents(match[1]);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private safeParseMonetaryCents(val: string): bigint {
    try {
      return parseMonetaryCents(val);
    } catch {
      const clean = val.replace(/[^0-9.]/g, '');
      const parsed = Math.round(parseFloat(clean) * 100);
      return BigInt(isNaN(parsed) ? 0 : parsed);
    }
  }

  private isHeaderOrDividerLine(line: string): boolean {
    return (
      /DATE|DESCRIPTION|KETERANGAN/i.test(line) &&
      /WITHDRAWALS|DEPOSITS|BALANCE|PENGELUARAN|SIMPANAN|BAKI/i.test(line)
    );
  }

  private isFooterNoise(line: string): boolean {
    return (
      /Hong\s*Leong\s*Bank/i.test(line) ||
      /Hong\s*Leong\s*Islamic/i.test(line) ||
      /PROTECTED\s*BY\s*PIDM/i.test(line) ||
      /PAGE\s*\d+\s*OF\s*\d+/i.test(line)
    );
  }
}
