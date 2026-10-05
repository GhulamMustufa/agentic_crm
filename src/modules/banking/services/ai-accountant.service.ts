import { Injectable } from '@nestjs/common';

import { AiGatewayService } from '../../../core/ai/ai-gateway.service';

import type { CounterpartyEntity } from '../../counterparties/domain/counterparty.entity';
import type { InvoiceEntity } from '../../invoices/domain/invoice.entity';
import type { AccountEntity } from '../../ledger/domain/account.entity';
import type { BankAccountEntity } from '../domain/bank-account.entity';
import type { BankTransactionEntity } from '../domain/bank-transaction.entity';
import type { ProposalType, AiDecisionEvidence } from '../domain/proposal.entity';

export interface AiClassificationResult {
  proposalType: ProposalType;
  confidenceScore: number;
  evidence: AiDecisionEvidence[];
  rationale: string;
  suggestedDebitAccountId: string;
  suggestedCreditAccountId: string;
  suggestedCounterpartyId?: string;
  suggestedInvoiceId?: string;
  isAmbiguous: boolean;
  autoPostEligible: boolean;
}

export interface ContextualAccountingKnowledge {
  bankAccount: BankAccountEntity;
  otherBankAccounts: BankAccountEntity[];
  counterparties: CounterpartyEntity[];
  openInvoices: InvoiceEntity[];
  accounts: AccountEntity[];
}

@Injectable()
export class AiAccountantService {
  constructor(private readonly aiGateway: AiGatewayService) {}

  getAiGateway(): AiGatewayService {
    return this.aiGateway;
  }

  /**
   * Evaluates a bank transaction against tenant financial state.
   * Deterministically calculates classification, counterparty matching, invoice matching,
   * confidence score, structured evidence, and journal proposals.
   */
  async evaluateTransaction(
    _tenantId: string,
    transaction: BankTransactionEntity,
    knowledge: ContextualAccountingKnowledge,
    options?: {
      simulateTimeout?: boolean;
      simulateFailure?: boolean;
      simulateAiTimeout?: boolean;
      simulateAiFailure?: boolean;
    },
  ): Promise<AiClassificationResult> {
    // 1. Simulate AI Failure / Timeout if requested for test resilience
    if (options?.simulateTimeout || options?.simulateAiTimeout) {
      throw new Error('AI Provider request timed out after 30000ms');
    }
    if (options?.simulateFailure || options?.simulateAiFailure) {
      throw new Error('AI Provider returned internal server error (500)');
    }

    const descUpper = transaction.rawDescription.toUpperCase();
    const isCredit = transaction.amountCents > 0n; // Inflow / Deposit
    const absAmount = isCredit ? transaction.amountCents : -transaction.amountCents;

    // Control Accounts
    const operatingCashAcc = knowledge.bankAccount.ledgerAccountId;
    const arAcc = knowledge.accounts.find((a) => a.accountCode === '1200')?.id || operatingCashAcc;
    const apAcc = knowledge.accounts.find((a) => a.accountCode === '2010')?.id || operatingCashAcc;
    const generalExpenseAcc =
      knowledge.accounts.find((a) => a.accountCode === '5010' || a.classification === 'EXPENSE')
        ?.id || apAcc;
    const generalRevenueAcc =
      knowledge.accounts.find((a) => a.accountCode === '4010' || a.classification === 'REVENUE')
        ?.id || arAcc;
    const suspenseAcc =
      knowledge.accounts.find((a) => a.accountCode === '3999')?.id || generalExpenseAcc;

    // --- RULE A: Internal Bank Transfer Detection ---
    const isTransferPattern =
      descUpper.includes('TRANSFER') ||
      descUpper.includes('XFER') ||
      descUpper.includes('SWEEP') ||
      descUpper.includes('INTER-ACCOUNT');

    if (isTransferPattern) {
      // Find matching counter-account
      const matchingAccount = knowledge.otherBankAccounts.find(
        (acc) =>
          acc.id !== knowledge.bankAccount.id &&
          (descUpper.includes(acc.accountName.toUpperCase()) ||
            descUpper.includes(acc.accountNumberLast4) ||
            descUpper.includes(acc.institutionName.toUpperCase())),
      );

      if (matchingAccount) {
        return {
          proposalType: 'TRANSFER',
          confidenceScore: 0.98,
          evidence: [
            {
              source: 'TRANSFER_PATTERN',
              matchedValue: matchingAccount.accountName,
              confidenceContribution: 0.5,
              reason: `Matched transfer to counter bank account ${matchingAccount.accountName} (*${matchingAccount.accountNumberLast4})`,
            },
          ],
          rationale: `Internal transfer between ${knowledge.bankAccount.accountName} and ${matchingAccount.accountName}.`,
          suggestedDebitAccountId: isCredit ? operatingCashAcc : matchingAccount.ledgerAccountId,
          suggestedCreditAccountId: isCredit ? matchingAccount.ledgerAccountId : operatingCashAcc,
          isAmbiguous: false,
          autoPostEligible: true,
        };
      }
    }

    // --- RULE B: Refund Detection ---
    const isRefundPattern =
      descUpper.includes('REFUND') ||
      descUpper.includes('RETURN') ||
      descUpper.includes('REVERSAL') ||
      descUpper.includes('CHARGEBACK REVERSAL');

    if (isRefundPattern) {
      // Check if counterparty is recognized
      const matchedCp = knowledge.counterparties.find(
        (cp) =>
          descUpper.includes(cp.normalizedName.toUpperCase()) ||
          descUpper.includes(cp.legalName.toUpperCase()),
      );
      const confidenceScore = matchedCp ? 0.95 : 0.92;
      const targetExpenseAcc = matchedCp?.defaultAccountId || generalExpenseAcc;

      // If inflow (credit) marked as refund: credit Expense (recovery) and debit Cash
      if (isCredit) {
        return {
          proposalType: 'REFUND',
          confidenceScore,
          evidence: [
            {
              source: 'REFUND_KEYWORD',
              matchedValue: transaction.rawDescription,
              reason: 'Keyword REFUND / RETURN detected on inbound credit deposit',
            },
            ...(matchedCp
              ? [
                  {
                    source: 'COUNTERPARTY_MATCH',
                    matchedValue: matchedCp.legalName,
                    reason: `Matched known vendor ${matchedCp.legalName}`,
                  },
                ]
              : []),
          ],
          rationale: `Vendor refund from ${matchedCp?.legalName || 'vendor'} ($${Number(absAmount) / 100}).`,
          suggestedDebitAccountId: operatingCashAcc,
          suggestedCreditAccountId: targetExpenseAcc,
          suggestedCounterpartyId: matchedCp?.id,
          isAmbiguous: false,
          autoPostEligible: confidenceScore >= 0.95,
        };
      }
    }

    // --- RULE C: Invoice / Bill Matching ---
    // Check if description mentions invoice number or counterparty
    for (const inv of knowledge.openInvoices) {
      const invNumInDesc = descUpper.includes(inv.invoiceNumber.toUpperCase());
      const exactAmountMatch = inv.amountDueCents === absAmount;

      if (invNumInDesc && exactAmountMatch) {
        // High confidence exact match!
        if (inv.invoiceType === 'INVOICE' && isCredit) {
          return {
            proposalType: 'INVOICE_MATCH',
            confidenceScore: 0.99,
            evidence: [
              {
                source: 'INVOICE_NUMBER',
                matchedValue: inv.invoiceNumber,
                reason: `Exact invoice number '${inv.invoiceNumber}' found in transaction description`,
              },
              {
                source: 'EXACT_AMOUNT',
                matchedValue: `$${Number(absAmount) / 100}`,
                reason: `Amount matches open amount due on invoice ${inv.invoiceNumber}`,
              },
            ],
            rationale: `Customer payment received for Invoice ${inv.invoiceNumber} ($${Number(absAmount) / 100}).`,
            suggestedDebitAccountId: operatingCashAcc,
            suggestedCreditAccountId: arAcc,
            suggestedCounterpartyId: inv.counterpartyId,
            suggestedInvoiceId: inv.id,
            isAmbiguous: false,
            autoPostEligible: true,
          };
        } else if (inv.invoiceType === 'BILL' && !isCredit) {
          return {
            proposalType: 'VENDOR_PAYMENT',
            confidenceScore: 0.99,
            evidence: [
              {
                source: 'BILL_NUMBER',
                matchedValue: inv.invoiceNumber,
                reason: `Bill number '${inv.invoiceNumber}' found in transaction description`,
              },
              {
                source: 'EXACT_AMOUNT',
                matchedValue: `$${Number(absAmount) / 100}`,
                reason: `Amount matches open amount due on bill ${inv.invoiceNumber}`,
              },
            ],
            rationale: `Vendor disbursement clearing Bill ${inv.invoiceNumber} ($${Number(absAmount) / 100}).`,
            suggestedDebitAccountId: apAcc,
            suggestedCreditAccountId: operatingCashAcc,
            suggestedCounterpartyId: inv.counterpartyId,
            suggestedInvoiceId: inv.id,
            isAmbiguous: false,
            autoPostEligible: true,
          };
        }
      } else if (exactAmountMatch && !invNumInDesc) {
        // Check if counterparty name matches description
        const cp = knowledge.counterparties.find((c) => c.id === inv.counterpartyId);
        if (cp && descUpper.includes(cp.normalizedName.toUpperCase())) {
          return {
            proposalType: inv.invoiceType === 'INVOICE' ? 'INVOICE_MATCH' : 'VENDOR_PAYMENT',
            confidenceScore: 0.96,
            evidence: [
              {
                source: 'COUNTERPARTY_MATCH',
                matchedValue: cp.legalName,
                reason: `Counterparty '${cp.legalName}' identified in narrative`,
              },
              {
                source: 'EXACT_AMOUNT',
                matchedValue: `$${Number(absAmount) / 100}`,
                reason: `Matches amount due on ${inv.invoiceType} ${inv.invoiceNumber}`,
              },
            ],
            rationale: `Payment of $${Number(absAmount) / 100} matched to counterparty ${cp.legalName} (${inv.invoiceNumber}).`,
            suggestedDebitAccountId: inv.invoiceType === 'INVOICE' ? operatingCashAcc : apAcc,
            suggestedCreditAccountId: inv.invoiceType === 'INVOICE' ? arAcc : operatingCashAcc,
            suggestedCounterpartyId: cp.id,
            suggestedInvoiceId: inv.id,
            isAmbiguous: false,
            autoPostEligible: true,
          };
        }
      }
    }

    // --- RULE D: Counterparty Entity Matching (No open invoice match) ---
    for (const cp of knowledge.counterparties) {
      if (
        descUpper.includes(cp.normalizedName.toUpperCase()) ||
        descUpper.includes(cp.legalName.toUpperCase())
      ) {
        const targetAccountId =
          cp.defaultAccountId || (isCredit ? generalRevenueAcc : generalExpenseAcc);
        return {
          proposalType: isCredit ? 'REVENUE_CLASSIFICATION' : 'EXPENSE_CLASSIFICATION',
          confidenceScore: 0.95,
          evidence: [
            {
              source: 'COUNTERPARTY_DIRECTORY',
              matchedValue: cp.legalName,
              reason: `Matched known directory counterparty '${cp.legalName}'`,
            },
          ],
          rationale: `Direct ${isCredit ? 'revenue from' : 'expense to'} recognized entity ${cp.legalName}.`,
          suggestedDebitAccountId: isCredit ? operatingCashAcc : targetAccountId,
          suggestedCreditAccountId: isCredit ? targetAccountId : operatingCashAcc,
          suggestedCounterpartyId: cp.id,
          isAmbiguous: false,
          autoPostEligible: true,
        };
      }
    }

    // --- RULE E: Category Keyword Heuristics ---
    if (!isCredit) {
      if (
        descUpper.includes('AWS') ||
        descUpper.includes('GITHUB') ||
        descUpper.includes('HEROKU') ||
        descUpper.includes('DATADOG') ||
        descUpper.includes('GOOGLE CLOUD')
      ) {
        const hostingAcc =
          knowledge.accounts.find((a) => a.accountCode === '5010')?.id || generalExpenseAcc;
        return {
          proposalType: 'EXPENSE_CLASSIFICATION',
          confidenceScore: 0.88,
          evidence: [
            {
              source: 'KEYWORD_PATTERN',
              matchedValue: 'Cloud Hosting',
              reason: 'Recognized infrastructure SaaS provider',
            },
          ],
          rationale: `Operational hosting & infrastructure expense for ${transaction.rawDescription}.`,
          suggestedDebitAccountId: hostingAcc,
          suggestedCreditAccountId: operatingCashAcc,
          isAmbiguous: false,
          autoPostEligible: false, // < 0.95 -> routes to Exception Center for human review
        };
      }
    }

    // --- RULE E2: Unresolved Invoice Reference (Unmatched Payment) ---
    const hasInvoicePattern =
      /INV(?:OICE)?[-#\s]*\w+/i.test(transaction.rawDescription) ||
      /BILL[-#\s]*\w+/i.test(transaction.rawDescription);

    if (hasInvoicePattern) {
      return {
        proposalType: isCredit ? 'INVOICE_MATCH' : 'VENDOR_PAYMENT',
        confidenceScore: 0.55,
        evidence: [
          {
            source: 'INVOICE_REFERENCE_UNRESOLVED',
            matchedValue: transaction.rawDescription,
            reason:
              'Description references invoice or bill number not currently found in open AR/AP ledger',
          },
        ],
        rationale: `Transaction appears to reference an invoice or bill, but no matching open record was identified: '${transaction.rawDescription}'.`,
        suggestedDebitAccountId: isCredit ? operatingCashAcc : apAcc,
        suggestedCreditAccountId: isCredit ? arAcc : operatingCashAcc,
        isAmbiguous: false,
        autoPostEligible: false,
      };
    }

    // --- RULE F: Ambiguous / Unknown Transaction ---
    // If no counterparty, no invoice, and unclear memo -> Ambiguous exception item
    return {
      proposalType: 'AMBIGUOUS',
      confidenceScore: 0.45,
      evidence: [
        {
          source: 'FALLTHROUGH',
          reason: 'No matching counterparty, invoice, or recurring pattern detected',
        },
      ],
      rationale: `Ambiguous transaction narrative '${transaction.rawDescription}'. Unable to determine counterparty or chart of accounts mapping with high confidence.`,
      suggestedDebitAccountId: isCredit ? operatingCashAcc : suspenseAcc,
      suggestedCreditAccountId: isCredit ? suspenseAcc : operatingCashAcc,
      isAmbiguous: true,
      autoPostEligible: false,
    };
  }
}
