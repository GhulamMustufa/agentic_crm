import { Injectable, Logger } from '@nestjs/common';

import type { ParsedStatementResult } from '../parsers/statement-parser.interface';

export interface StatementValidationIssue {
  type:
    | 'CHECKSUM_MISMATCH'
    | 'RUNNING_BALANCE_BREAK'
    | 'SUMMATION_MISMATCH'
    | 'DATE_OUT_OF_BOUNDS'
    | 'ZERO_TRANSACTIONS';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  message: string;
  pageNumber?: number;
  sourceSequence?: number;
  expectedCents?: bigint;
  actualCents?: bigint;
  discrepancyCents?: bigint;
  evidence?: Record<string, unknown>;
}

export interface StatementValidationResult {
  isValid: boolean;
  checksumMatches: boolean;
  runningBalanceContinuous: boolean;
  summationMatches: boolean;
  calculatedClosingBalanceCents: bigint;
  expectedClosingBalanceCents: bigint;
  checksumDiscrepancyCents: bigint;
  totalDebitsCents: bigint;
  totalCreditsCents: bigint;
  calculatedDebitsCents: bigint;
  calculatedCreditsCents: bigint;
  issues: StatementValidationIssue[];
  failureSummary?: string;
  auditEvidence: Record<string, unknown>;
}

@Injectable()
export class StatementValidationService {
  private readonly logger = new Logger(StatementValidationService.name);

  /**
   * Deterministically validates a parsed statement against mathematical accounting invariants:
   * 1. Summation of individual debit and credit line items.
   * 2. Continuous running balance progression (step-by-step).
   * 3. Master checksum equation: Opening + Credits - Debits == Closing.
   * 4. Date boundary validation.
   */
  validate(parsed: ParsedStatementResult): StatementValidationResult {
    const issues: StatementValidationIssue[] = [];

    // 1. Calculate line item totals
    let calculatedDebitsCents = 0n;
    let calculatedCreditsCents = 0n;

    for (const tx of parsed.transactions) {
      if (tx.amountCents < 0n) {
        calculatedDebitsCents += -tx.amountCents;
      } else {
        calculatedCreditsCents += tx.amountCents;
      }
    }

    // 2. Check for empty statement with non-zero balances
    if (parsed.transactions.length === 0) {
      if (parsed.openingBalanceCents !== parsed.closingBalanceCents) {
        issues.push({
          type: 'ZERO_TRANSACTIONS',
          severity: 'HIGH',
          message: `Statement has 0 extracted transactions but opening balance (${parsed.openingBalanceCents}) does not equal closing balance (${parsed.closingBalanceCents})`,
        });
      }
    }

    // 3. Summation Check (if statement header reported non-zero totals)
    let summationMatches = true;
    if (parsed.totalDebitsCents > 0n && parsed.totalDebitsCents !== calculatedDebitsCents) {
      summationMatches = false;
      const discrepancy = parsed.totalDebitsCents - calculatedDebitsCents;
      issues.push({
        type: 'SUMMATION_MISMATCH',
        severity: 'HIGH',
        message: `Debit summation mismatch: header reports ${parsed.totalDebitsCents} cents, but sum of transactions is ${calculatedDebitsCents} cents (diff: ${discrepancy} cents)`,
        expectedCents: parsed.totalDebitsCents,
        actualCents: calculatedDebitsCents,
        discrepancyCents: discrepancy,
      });
    }

    if (parsed.totalCreditsCents > 0n && parsed.totalCreditsCents !== calculatedCreditsCents) {
      summationMatches = false;
      const discrepancy = parsed.totalCreditsCents - calculatedCreditsCents;
      issues.push({
        type: 'SUMMATION_MISMATCH',
        severity: 'HIGH',
        message: `Credit summation mismatch: header reports ${parsed.totalCreditsCents} cents, but sum of transactions is ${calculatedCreditsCents} cents (diff: ${discrepancy} cents)`,
        expectedCents: parsed.totalCreditsCents,
        actualCents: calculatedCreditsCents,
        discrepancyCents: discrepancy,
      });
    }

    // 4. Continuous Running Balance Step Progression
    let runningBalanceContinuous = true;
    const sortedTx = [...parsed.transactions].sort((a, b) => {
      if (a.sourceSequence !== undefined && b.sourceSequence !== undefined) {
        return a.sourceSequence - b.sourceSequence;
      }
      return a.date.localeCompare(b.date);
    });

    let currentTrackedBalance: bigint | undefined = parsed.openingBalanceCents;
    if (
      currentTrackedBalance === 0n &&
      sortedTx.length > 0 &&
      sortedTx[0]?.runningBalanceCents !== undefined
    ) {
      currentTrackedBalance = sortedTx[0].runningBalanceCents - sortedTx[0].amountCents;
    }

    for (let i = 0; i < sortedTx.length; i++) {
      const tx = sortedTx[i]!;

      if (currentTrackedBalance !== undefined && tx.runningBalanceCents !== undefined) {
        const expectedStepBalance: bigint = currentTrackedBalance + tx.amountCents;
        if (expectedStepBalance !== tx.runningBalanceCents) {
          runningBalanceContinuous = false;
          const stepDiscrepancy: bigint = tx.runningBalanceCents - expectedStepBalance;
          issues.push({
            type: 'RUNNING_BALANCE_BREAK',
            severity: 'CRITICAL',
            message: `Running balance broken at step ${i + 1} (Page ${tx.pageNumber ?? 1}, '${tx.description}'): expected balance ${expectedStepBalance} cents, statement reports ${tx.runningBalanceCents} cents (diff: ${stepDiscrepancy} cents)`,
            pageNumber: tx.pageNumber,
            sourceSequence: tx.sourceSequence ?? i + 1,
            expectedCents: expectedStepBalance,
            actualCents: tx.runningBalanceCents,
            discrepancyCents: stepDiscrepancy,
            evidence: {
              rawPrimaryText: tx.rawPrimaryText,
              transactionAmountCents: tx.amountCents.toString(),
              priorBalanceCents: currentTrackedBalance.toString(),
            },
          });
          // Update to the statement's reported balance to detect further step breaks
          currentTrackedBalance = tx.runningBalanceCents;
        } else {
          currentTrackedBalance = tx.runningBalanceCents;
        }
      } else if (tx.runningBalanceCents !== undefined) {
        currentTrackedBalance = tx.runningBalanceCents;
      } else if (currentTrackedBalance !== undefined) {
        currentTrackedBalance = currentTrackedBalance + tx.amountCents;
      }
    }

    // 5. Master Checksum Equation: Opening + Credits - Debits == Closing
    const calculatedClosingBalanceCents =
      parsed.openingBalanceCents + calculatedCreditsCents - calculatedDebitsCents;
    let checksumMatches = true;
    let checksumDiscrepancyCents = 0n;

    if (parsed.closingBalanceCents !== 0n || parsed.openingBalanceCents !== 0n) {
      checksumDiscrepancyCents = parsed.closingBalanceCents - calculatedClosingBalanceCents;
      if (checksumDiscrepancyCents !== 0n) {
        checksumMatches = false;
        issues.push({
          type: 'CHECKSUM_MISMATCH',
          severity: 'CRITICAL',
          message: `Mathematical checksum failed: Opening (${parsed.openingBalanceCents}) + Credits (${calculatedCreditsCents}) - Debits (${calculatedDebitsCents}) = ${calculatedClosingBalanceCents} cents, but statement reports closing balance ${parsed.closingBalanceCents} cents (Discrepancy: ${checksumDiscrepancyCents} cents)`,
          expectedCents: parsed.closingBalanceCents,
          actualCents: calculatedClosingBalanceCents,
          discrepancyCents: checksumDiscrepancyCents,
          evidence: {
            openingBalanceCents: parsed.openingBalanceCents.toString(),
            closingBalanceCents: parsed.closingBalanceCents.toString(),
            calculatedDebitsCents: calculatedDebitsCents.toString(),
            calculatedCreditsCents: calculatedCreditsCents.toString(),
          },
        });
      }
    }

    // 6. Date Out of Bounds Check
    if (parsed.startDate && parsed.endDate) {
      for (const tx of parsed.transactions) {
        // Allow up to 3 days grace for month-end value date clearance
        if (
          tx.date < parsed.startDate.slice(0, 7) ||
          tx.date > `${parsed.endDate.slice(0, 4)}-12-31`
        ) {
          issues.push({
            type: 'DATE_OUT_OF_BOUNDS',
            severity: 'MEDIUM',
            message: `Transaction date '${tx.date}' falls outside statement period (${parsed.startDate} to ${parsed.endDate})`,
            pageNumber: tx.pageNumber,
            sourceSequence: tx.sourceSequence,
          });
        }
      }
    }

    // Determine final validity: any CRITICAL or HIGH issue fails the gate
    const blockingIssues = issues.filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH');
    const isValid = blockingIssues.length === 0;

    const failureSummary = !isValid ? blockingIssues.map((i) => i.message).join(' | ') : undefined;

    const auditEvidence: Record<string, unknown> = {
      openingBalanceCents: parsed.openingBalanceCents.toString(),
      closingBalanceCents: parsed.closingBalanceCents.toString(),
      calculatedClosingBalanceCents: calculatedClosingBalanceCents.toString(),
      checksumDiscrepancyCents: checksumDiscrepancyCents.toString(),
      totalDebitsCents: (parsed.totalDebitsCents || calculatedDebitsCents).toString(),
      totalCreditsCents: (parsed.totalCreditsCents || calculatedCreditsCents).toString(),
      calculatedDebitsCents: calculatedDebitsCents.toString(),
      calculatedCreditsCents: calculatedCreditsCents.toString(),
      transactionCount: parsed.transactions.length,
      checksumMatches,
      runningBalanceContinuous,
      summationMatches,
      issueCount: issues.length,
      criticalIssueCount: blockingIssues.length,
    };

    if (!isValid) {
      this.logger.warn(`Statement financial validation failed: ${failureSummary}`);
    } else {
      this.logger.log(
        `Statement financial validation passed: checksum matched ($${Number(calculatedClosingBalanceCents) / 100}), continuous running balance verified over ${parsed.transactions.length} rows`,
      );
    }

    return {
      isValid,
      checksumMatches,
      runningBalanceContinuous,
      summationMatches,
      calculatedClosingBalanceCents,
      expectedClosingBalanceCents: parsed.closingBalanceCents,
      checksumDiscrepancyCents,
      totalDebitsCents: parsed.totalDebitsCents,
      totalCreditsCents: parsed.totalCreditsCents,
      calculatedDebitsCents,
      calculatedCreditsCents,
      issues,
      failureSummary,
      auditEvidence,
    };
  }
}
