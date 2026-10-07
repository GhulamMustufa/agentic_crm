import { Injectable } from '@nestjs/common';

import { normalizeDate, parseMonetaryCents } from '../csv-statement.parser';

import type { IBankStatementAdapter } from './bank-adapter.interface';
import type {
  BankCode,
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../layout/layout.types';
import type { ParsedStatementResult, ParsedTransactionLine } from '../statement-parser.interface';

interface ActiveBankIslamTransaction {
  date: string;
  valueDate?: string;
  primaryDescription: string;
  amountCents: bigint;
  direction: 'DEBIT' | 'CREDIT';
  runningBalanceCents?: bigint;
  bankReference?: string;
  rawPrimaryText: string;
  continuationLines: string[];
  pageNumber: number;
  sourceSequence: number;
}

@Injectable()
export class BankIslamAdapter implements IBankStatementAdapter {
  readonly bankCode: BankCode = 'BANK_ISLAM';
  readonly adapterVersion = '1.2.0-bimb';

  supports(inspection: DocumentInspectionResult): boolean {
    return (
      inspection.detectedBank === 'BANK_ISLAM' ||
      /Bank\s*Islam\s*Malaysia|Bank\s*Islam\b/i.test(inspection.bankDisplayName) ||
      inspection.detectedFormat === 'BANK_ISLAM_STATEMENT'
    );
  }

  async parse(
    layout: StructuredDocumentLayout,
    inspection: DocumentInspectionResult,
  ): Promise<ParsedStatementResult> {
    const fullText = layout.pages
      .map((p) => p.rawText || [...p.metadataLines, ...p.tableLines].join('\n'))
      .join('\n');
    const { startDate, endDate } = this.extractStatementPeriod(fullText, inspection.statementDate);
    const openingBalanceCents = this.extractOpeningBalance(fullText);
    const explicitClosing = this.extractClosingBalance(fullText);

    const transactions: ParsedTransactionLine[] = [];
    let activeTx: ActiveBankIslamTransaction | null = null;
    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;
    let sequenceCounter = 1;
    let lastRunningBalance: bigint | undefined = openingBalanceCents;

    for (const page of layout.pages) {
      for (const line of page.tableLines) {
        if (this.isHeaderOrNoise(line)) {
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

          let runningBalanceCents: bigint | undefined = undefined;
          if (match.rawBalance) {
            try {
              runningBalanceCents = parseMonetaryCents(match.rawBalance);
            } catch {
              // Ignore invalid balance string
            }
          }

          activeTx = {
            date: normalizeDate(match.entryDate),
            valueDate: match.valueDate ? normalizeDate(match.valueDate) : undefined,
            direction: match.direction,
            amountCents: match.amountCents,
            runningBalanceCents,
            primaryDescription: match.description.trim(),
            continuationLines: [],
            rawPrimaryText: line,
            bankReference: match.bankReference,
            pageNumber: page.pageNumber,
            sourceSequence: sequenceCounter++,
          };
        } else if (activeTx) {
          if (this.isFooterNoise(line)) {
            continue;
          }

          activeTx.continuationLines.push(line);

          // Extract Islamic reference numbers or DuitNow IDs
          const refMatch =
            line.match(/(?:NO\.?\s*RUJUKAN|REF|RUJUKAN|CHQ)\s*[:.\s]*(\S+)/i) ||
            line.match(/\b(\d{14,18})\b/);
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
          : 'Bank Islam Malaysia Berhad',
      accountNumberLast4: inspection.accountNumber ? inspection.accountNumber.slice(-4) : undefined,
      accountType: 'CHECKING',
      pageCount: layout.pageCount,
      extractionMode: inspection.suggestedMode,
      bankDetected: 'BANK_ISLAM',
      formatDetected: 'BANK_ISLAM_STATEMENT',
      parserVersion: this.adapterVersion,
      metadata: {
        detectedBank: 'BANK_ISLAM',
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
    // 1. Pipe-delimited variant
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      const datePart = parts[0] ?? '';
      const isDate =
        /^\d{4}-\d{2}-\d{2}$/.test(datePart) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(datePart);

      if (isDate && parts.length === 5) {
        // Date | Butiran | Debit | Kredit | Baki
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

    // 2. Dual-amount column variant: Tarikh | Butiran | Debit | Kredit | Baki
    const dualAmountRegex =
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([0-9,]*\.?\d{2}|-)\s+([0-9,]*\.?\d{2}|-)\s+([0-9,]*\.?\d{2})$/;
    const dualMatch = line.match(dualAmountRegex);
    if (dualMatch?.[1] && dualMatch[2] && dualMatch[3] && dualMatch[4] && dualMatch[5]) {
      const rawDebit = dualMatch[3];
      const rawCredit = dualMatch[4];
      const rawBal = dualMatch[5];

      const debitVal = rawDebit !== '-' ? this.safeParseMonetaryCents(rawDebit) : 0n;
      const creditVal = rawCredit !== '-' ? this.safeParseMonetaryCents(rawCredit) : 0n;

      if (debitVal > 0n && creditVal === 0n) {
        return {
          entryDate: dualMatch[1],
          description: dualMatch[2],
          amountCents: -debitVal,
          direction: 'DEBIT',
          rawBalance: rawBal,
        };
      } else if (creditVal > 0n && debitVal === 0n) {
        return {
          entryDate: dualMatch[1],
          description: dualMatch[2],
          amountCents: creditVal,
          direction: 'CREDIT',
          rawBalance: rawBal,
        };
      }

      if (lastBalance !== undefined) {
        try {
          const currentBal = parseMonetaryCents(rawBal);
          const delta = currentBal - lastBalance;
          if (delta < 0n) {
            return {
              entryDate: dualMatch[1],
              description: dualMatch[2],
              amountCents: delta,
              direction: 'DEBIT',
              rawBalance: rawBal,
            };
          } else if (delta > 0n) {
            return {
              entryDate: dualMatch[1],
              description: dualMatch[2],
              amountCents: delta,
              direction: 'CREDIT',
              rawBalance: rawBal,
            };
          }
        } catch {
          // Fall through
        }
      }
    }

    // 3. Single amount + Balance variant
    const singleAmountRegex =
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([-$+]*\(?(?:RM|MYR)?\s*[\d,]*\.?\d{2}\)?[-\s+]*\+?(?:DR|CR)?)\s+([0-9,]*\.?\d{2})$/i;
    const singleMatch = line.match(singleAmountRegex);
    if (singleMatch?.[1] && singleMatch[2] && singleMatch[3] && singleMatch[4]) {
      const rawAmt = singleMatch[3];
      const rawBal = singleMatch[4];
      const parsedAmt = parseMonetaryCents(rawAmt);
      let isDebit = false;

      if (parsedAmt < 0n || rawAmt.endsWith('-') || /DR/i.test(rawAmt)) {
        isDebit = true;
      } else if (lastBalance !== undefined) {
        try {
          const curBal = parseMonetaryCents(rawBal);
          isDebit = curBal < lastBalance;
        } catch {
          isDebit = /BAYARAN|KELUAR|DEBIT|PINDAHAN|PENGELUARAN/i.test(singleMatch[2]);
        }
      } else {
        isDebit = /BAYARAN|KELUAR|DEBIT|PINDAHAN|PENGELUARAN/i.test(singleMatch[2]);
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

  private finalizeTransaction(tx: ActiveBankIslamTransaction): ParsedTransactionLine {
    const continuationText = tx.continuationLines.join(' | ');
    let normalizedPayee: string | undefined = undefined;

    for (const cl of tx.continuationLines) {
      const match = cl.match(/(?:PENERIMA|KEPADA|PAYEE|BENEFICIARY)\s*[:.\s]*([^\r\n|]+)/i);
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
      /(?:TEMPOH\s*PENYATA|TEMPOH|STATEMENT\s*PERIOD|PERIOD)\s*[:.\s]*(\S+)\s*(?:HINGGA|TO|-)\s*(\S+)/i,
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
      /(?:BAKI\s*AWAL|BAKI\s*DIBAWA\s*KE\s*HADAPAN|OPENING\s*BALANCE|BALANCE\s*B\/F)\s*[:.\s]*([^\r\n]+)/i,
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
      /(?:BAKI\s*AKHIR|BAKI\s*DIBAWA\s*KE\s*HADAPAN|CLOSING\s*BALANCE|BALANCE\s*C\/F)\s*[:.\s]*([^\r\n]+)/i,
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
      return 0n;
    }
  }

  private isHeaderOrNoise(line: string): boolean {
    return (
      /TARIKH|DATE|TRANSAKSI|TRANSACTION|BUTIRAN|DEBIT|KREDIT|CREDIT|BAKI|BALANCE|PENYATA|STATEMENT|BANK\s*ISLAM|PAGE|MUKA/i.test(
        line,
      ) && !/^\d{1,2}[/-]\d{1,2}/.test(line)
    );
  }

  private isFooterNoise(line: string): boolean {
    return (
      /JUMLAH|TOTAL|PIDM|KOMPUTER|COMPUTER/i.test(line) ||
      /BAKI\s*AKHIR|CLOSING\s*BALANCE|BALANCE\s*C\/F/i.test(line) ||
      /PAGE\s*\d+\s*OF\s*\d+/i.test(line)
    );
  }
}
