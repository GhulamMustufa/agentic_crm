import { Injectable } from '@nestjs/common';

import { normalizeDate, parseMonetaryCents } from '../csv-statement.parser';

import type { IBankStatementAdapter } from './bank-adapter.interface';
import type {
  BankCode,
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../layout/layout.types';
import type { ParsedStatementResult, ParsedTransactionLine } from '../statement-parser.interface';

interface ActiveTransactionState {
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
export class MaybankAdapter implements IBankStatementAdapter {
  readonly bankCode: BankCode = 'MAYBANK';
  readonly adapterVersion = '2.1.0-maybank-fsm';

  /**
   * Identifies Maybank or Maybank Islamic statement layouts.
   */
  supports(inspection: DocumentInspectionResult): boolean {
    return (
      inspection.detectedBank === 'MAYBANK' ||
      inspection.detectedBank === 'MAYBANK_ISLAMIC' ||
      inspection.detectedFormat === 'MAYBANK_TRILINGUAL_STATEMENT' ||
      inspection.detectedFormat === 'MAYBANK_STANDARD_STATEMENT'
    );
  }

  async parse(
    layout: StructuredDocumentLayout,
    inspection: DocumentInspectionResult,
  ): Promise<ParsedStatementResult> {
    const fullText = layout.pages.map((p) => p.rawText).join('\n');

    // 1. Resolve statement year and statement period
    const statementYear = this.extractStatementYear(fullText, inspection.statementDate);
    const { startDate, endDate } = this.extractStatementPeriod(fullText, statementYear);

    // 2. Extract Opening & Ending Balances
    const openingBalanceCents = this.extractBeginningBalance(fullText);
    let closingBalanceCents = 0n;
    let foundExplicitClosing = false;

    // 3. Multi-line Transaction Parsing State Machine across pages
    const parsedTransactions: ParsedTransactionLine[] = [];
    let totalDebitsCents = 0n;
    let totalCreditsCents = 0n;
    let sequenceCounter = 1;
    let activeTx: ActiveTransactionState | null = null;
    let lastRunningBalance: bigint | undefined = undefined;

    for (const page of layout.pages) {
      for (const rawLine of page.tableLines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        // Check if line is a table header to ignore
        if (this.isHeaderOrDividerLine(line)) {
          continue;
        }

        // Check if line is beginning balance marker
        if (/BEGINNING\s*BALANCE|BAKI\s*AWAL/i.test(line)) {
          continue;
        }

        // Check if line initiates a new transaction:
        // Pattern: [DD/MM] (optional [DD/MM]) [DESCRIPTION] [AMOUNT (with optional trailing -/+)] [BALANCE]
        const txMatch = this.matchPrimaryTransactionLine(line);

        if (txMatch) {
          // Flush currently active transaction
          if (activeTx) {
            const finalized = this.finalizeTransaction(activeTx);
            parsedTransactions.push(finalized);
            if (finalized.amountCents < 0n) {
              totalDebitsCents += -finalized.amountCents;
            } else {
              totalCreditsCents += finalized.amountCents;
            }
            if (finalized.runningBalanceCents !== undefined) {
              lastRunningBalance = finalized.runningBalanceCents;
            }
          }

          // Compute normalized transaction dates
          const entryDate = this.normalizePartialDate(txMatch.entryDate, statementYear);
          const valueDate = txMatch.valueDate
            ? this.normalizePartialDate(txMatch.valueDate, statementYear)
            : undefined;

          // Parse Amount & Direction (Maybank trailing '-' is DEBIT, '+' or unsigned is CREDIT)
          const { amountCents, direction } = this.parseMaybankAmount(txMatch.rawAmount);
          const runningBalanceCents = txMatch.rawBalance
            ? this.parseMonetaryValue(txMatch.rawBalance)
            : undefined;

          activeTx = {
            sourceSequence: sequenceCounter++,
            pageNumber: page.pageNumber,
            date: entryDate,
            valueDate,
            direction,
            amountCents,
            runningBalanceCents,
            primaryDescription: txMatch.description.trim(),
            continuationLines: [],
            rawPrimaryText: line,
          };
        } else if (activeTx) {
          // Process continuation line for the currently active transaction
          // Filter out isolated footer noise if any leaked through
          if (this.isFooterNoise(line)) {
            continue;
          }

          activeTx.continuationLines.push(line);

          // Extract DuitNow or bank reference numbers if present
          const refMatch = line.match(/\b(\d{14,16})\b/);
          if (refMatch?.[1] && !activeTx.bankReference) {
            activeTx.bankReference = refMatch[1];
          }
        }
      }
    }

    // Flush last pending transaction
    if (activeTx) {
      const finalized = this.finalizeTransaction(activeTx);
      parsedTransactions.push(finalized);
      if (finalized.amountCents < 0n) {
        totalDebitsCents += -finalized.amountCents;
      } else {
        totalCreditsCents += finalized.amountCents;
      }
      if (finalized.runningBalanceCents !== undefined) {
        lastRunningBalance = finalized.runningBalanceCents;
      }
    }

    // 4. Determine Closing Balance
    if (parsedTransactions.length > 0 && lastRunningBalance !== undefined) {
      closingBalanceCents = lastRunningBalance;
      foundExplicitClosing = true;
    } else {
      const explicitClosing = this.extractEndingBalance(fullText);
      if (explicitClosing !== undefined) {
        closingBalanceCents = explicitClosing;
        foundExplicitClosing = true;
      }
    }

    if (!foundExplicitClosing) {
      closingBalanceCents = openingBalanceCents + totalCreditsCents - totalDebitsCents;
    }

    // Determine effective dates
    let finalStartDate = startDate;
    let finalEndDate = endDate;

    if (parsedTransactions.length > 0) {
      const firstDate = parsedTransactions[0]?.date;
      const lastDate = parsedTransactions[parsedTransactions.length - 1]?.date;
      if (!finalStartDate && firstDate) {
        finalStartDate = firstDate;
      }
      if (!finalEndDate && lastDate) {
        finalEndDate = lastDate;
      }
    }

    return {
      startDate: finalStartDate,
      endDate: finalEndDate,
      openingBalanceCents,
      closingBalanceCents,
      totalDebitsCents,
      totalCreditsCents,
      transactions: parsedTransactions,
      bankName:
        inspection.detectedBank === 'MAYBANK_ISLAMIC'
          ? 'Maybank Islamic Berhad'
          : 'Malayan Banking Berhad',
      accountNumberLast4: inspection.accountNumber ? inspection.accountNumber.slice(-4) : undefined,
      accountType: 'CHECKING',
      pageCount: layout.pageCount,
      extractionMode: inspection.suggestedMode,
      bankDetected: inspection.detectedBank,
      formatDetected: 'MAYBANK_TRILINGUAL_STATEMENT',
      parserVersion: this.adapterVersion,
      metadata: {
        detectedBank: inspection.detectedBank,
        statementYear,
        adapter: this.adapterVersion,
        totalExtracted: parsedTransactions.length,
        hasContinuousBalance: true,
        accountNumber: inspection.accountNumber,
      },
    };
  }

  /**
   * Matches primary transaction lines.
   * Format: "01/06 [01/06] TRANSFER FR A/C 1,500.00- 12,363.00"
   * Or:     "03/06 TRANSFER TO A/C .70+ 2,990.14"
   * Or:     "2026-03-05 | Bayaran Invois Pelanggan INV-MY-101 | RM 8,500.00"
   */
  private matchPrimaryTransactionLine(line: string): {
    entryDate: string;
    valueDate?: string;
    description: string;
    rawAmount: string;
    rawBalance?: string;
  } | null {
    // Pipe-delimited or standard Malaysian format with full date
    const pipeRegex =
      /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:\|\s+)?(.+?)\s+(?:\|\s+)?([-$+]*\(?(?:RM|MYR)?\s*[\d,]*\.?\d{2}\)?[-\s+]*\+?(?:DR|CR)?)(?:\s+[\d,]*\.?\d{2})?$/i;
    const pipeMatch = line.match(pipeRegex);
    if (pipeMatch?.[1] && pipeMatch[2] && pipeMatch[3]) {
      return {
        entryDate: pipeMatch[1],
        description: pipeMatch[2],
        rawAmount: pipeMatch[3],
        rawBalance: pipeMatch[4],
      };
    }

    // Two dates variant: Entry date + Value date
    const twoDatesRegex =
      /^(\d{1,2}\/\d{1,2})\s+(\d{1,2}\/\d{1,2})\s+(.+?)\s+([0-9,]*\.?\d{2}[-+])(?:\s+([0-9,]*\.?\d{2}))?$/;
    const twoDatesMatch = line.match(twoDatesRegex);
    if (twoDatesMatch?.[1] && twoDatesMatch[2] && twoDatesMatch[3] && twoDatesMatch[4]) {
      return {
        entryDate: twoDatesMatch[1],
        valueDate: twoDatesMatch[2],
        description: twoDatesMatch[3],
        rawAmount: twoDatesMatch[4],
        rawBalance: twoDatesMatch[5],
      };
    }

    // Single date variant
    const singleDateRegex =
      /^(\d{1,2}\/\d{1,2})\s+(.+?)\s+([0-9,]*\.?\d{2}[-+])(?:\s+([0-9,]*\.?\d{2}))?$/;
    const singleDateMatch = line.match(singleDateRegex);
    if (singleDateMatch?.[1] && singleDateMatch[2] && singleDateMatch[3]) {
      return {
        entryDate: singleDateMatch[1],
        description: singleDateMatch[2],
        rawAmount: singleDateMatch[3],
        rawBalance: singleDateMatch[4],
      };
    }

    return null;
  }

  /**
   * Parses Maybank amount notation with trailing minus or plus sign, or prefix sign/currency.
   */
  private parseMaybankAmount(rawAmount: string): {
    amountCents: bigint;
    direction: 'DEBIT' | 'CREDIT';
  } {
    const isExplicitDebit = rawAmount.endsWith('-');
    const cents = parseMonetaryCents(rawAmount);

    if (cents < 0n || isExplicitDebit) {
      const positiveVal = cents < 0n ? -cents : cents;
      return {
        amountCents: -positiveVal,
        direction: 'DEBIT',
      };
    }

    return {
      amountCents: cents,
      direction: 'CREDIT',
    };
  }

  private parseMonetaryValue(val: string): bigint {
    const clean = val.replace(/[,\s]/g, '');
    const num = Math.round(parseFloat(clean) * 100);
    return BigInt(isNaN(num) ? 0 : num);
  }

  /**
   * Assembles full description, extracts clean counterparty / payee, and builds transaction line.
   */
  private finalizeTransaction(tx: ActiveTransactionState): ParsedTransactionLine {
    const continuationText = tx.continuationLines.join(' | ');

    // Extract counterparty from first continuation line if ending in '*' (standard Maybank pattern)
    let normalizedPayee: string | undefined = undefined;
    for (const line of tx.continuationLines) {
      const trimmed = line.trim();
      if (trimmed.endsWith('*') && trimmed.length > 2) {
        normalizedPayee = trimmed.slice(0, -1).trim();
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
      pageNumber: tx.pageNumber,
      sourceSequence: tx.sourceSequence,
      extractionMethod: 'MAYBANK_FSM_ADAPTER',
      extractionConfidence: 1.0,
      riskLevel: 'LOW',
      sourceEvidence: {
        payeeFound: normalizedPayee !== undefined,
        continuationLineCount: tx.continuationLines.length,
        hasReference: tx.bankReference !== undefined,
      },
    };
  }

  private normalizePartialDate(partial: string, statementYear: number): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(partial)) {
      return partial;
    }
    const parts = partial.split('/');
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      return normalizeDate(partial);
    }
    if (parts.length === 2 && parts[0] && parts[1]) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      return `${statementYear}-${month}-${day}`;
    }
    return partial;
  }

  private extractStatementYear(text: string, statementDate?: string): number {
    if (statementDate) {
      const parts = statementDate.split(/[/.-]/);
      if (parts.length === 3 && parts[2]) {
        let yr = parseInt(parts[2], 10);
        if (yr < 100) {
          yr += 2000;
        }
        if (!isNaN(yr) && yr > 2000 && yr < 2100) {
          return yr;
        }
      }
    }

    const match = text.match(
      /(?:STATEMENT\s*DATE|TARIKH\s*PENYATA)\s*[:.\s]*\d{1,2}[/-]\d{1,2}[/-](\d{2,4})/i,
    );
    if (match?.[1]) {
      let yr = parseInt(match[1], 10);
      if (yr < 100) {
        yr += 2000;
      }
      return yr;
    }

    return new Date().getFullYear();
  }

  private extractStatementPeriod(
    text: string,
    statementYear: number,
  ): { startDate: string; endDate: string } {
    const periodMatch = text.match(
      /(?:STATEMENT\s*PERIOD|PERIOD|TEMPOH\s*PENYATA|TEMPOH)\s*[:.\s]*(\S+)\s*(?:TO|-|HINGGA)\s*(\S+)/i,
    );
    if (periodMatch?.[1] && periodMatch[2]) {
      try {
        return {
          startDate: normalizeDate(periodMatch[1]),
          endDate: normalizeDate(periodMatch[2]),
        };
      } catch {
        // Fall back
      }
    }

    const dateMatch = text.match(
      /(?:STATEMENT\s*DATE|TARIKH\s*PENYATA)\s*[:.\s]*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i,
    );
    if (dateMatch?.[1] && dateMatch[2]) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const endDate = `${statementYear}-${month}-${day}`;
      const startDate = `${statementYear}-${month}-01`;
      return { startDate, endDate };
    }

    return {
      startDate: `${statementYear}-01-01`,
      endDate: `${statementYear}-12-31`,
    };
  }

  private extractBeginningBalance(text: string): bigint {
    const match =
      text.match(/(?:BEGINNING|STARTING)\s*BALANCE\s*([0-9,]*\.?\d{2})/i) ||
      text.match(/(?:Baki\s*Awal|Beginning\s*Balance|Starting\s*Balance)\s*[:.\s]*([^\r\n]+)/i);
    if (match?.[1]) {
      try {
        return parseMonetaryCents(match[1]);
      } catch {
        return this.parseMonetaryValue(match[1]);
      }
    }
    return 0n;
  }

  private extractEndingBalance(text: string): bigint | undefined {
    const match =
      text.match(/(?:ENDING|CLOSING)\s*BALANCE\s*([0-9,]*\.?\d{2})/i) ||
      text.match(/(?:Baki\s*Akhir|Ending\s*Balance|Closing\s*Balance)\s*[:.\s]*([^\r\n]+)/i);
    if (match?.[1]) {
      try {
        return parseMonetaryCents(match[1]);
      } catch {
        return this.parseMonetaryValue(match[1]);
      }
    }
    return undefined;
  }

  private isHeaderOrDividerLine(line: string): boolean {
    return (
      /URUSNIAGA\s*AKAUN/i.test(line) ||
      /TARIKH\s*MASUK/i.test(line) ||
      /進支日期/i.test(line) ||
      /ENTRY\s*DATE/i.test(line) ||
      /VALUE\s*DATE/i.test(line) ||
      /TRANSACTION\s*DESCRIPTION/i.test(line)
    );
  }

  private isFooterNoise(line: string): boolean {
    return (
      /Maybank\s*Islamic\s*Berhad/i.test(line) ||
      /Malayan\s*Banking\s*Berhad/i.test(line) ||
      /MUKA\/\s*頁\s*\/PAGE/i.test(line) ||
      /PROTECTED\s*BY\s*PIDM/i.test(line) ||
      /BAKI\s*LEGAR/i.test(line) ||
      /LEDGER\s*BALANCE/i.test(line) ||
      /Perhatian\s*\/\s*Note/i.test(line) ||
      /SME\s*FIRST\s*ACCOUNT/i.test(line)
    );
  }
}
