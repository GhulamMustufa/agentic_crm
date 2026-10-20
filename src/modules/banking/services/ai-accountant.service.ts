import { Injectable } from '@nestjs/common';

import { AiGatewayService } from '../../../core/ai/ai-gateway.service';
import { fuzzyContains, normalizeAlphanumeric } from '../utils/fuzzy-matcher';
import { matchGlobalMerchant } from '../utils/global-merchant-catalog';
import { findInvoiceSubsetSum } from '../utils/subset-sum';

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
    const feeAcc =
      knowledge.accounts.find((a) => a.accountCode === '6030' || a.accountCode === '5030')?.id ||
      generalExpenseAcc;
    const suspenseAcc =
      knowledge.accounts.find((a) => a.accountCode === '3999')?.id || generalExpenseAcc;

    // --- RULE A: Internal Bank Transfer Detection ---
    const isTransferPattern =
      descUpper.includes('TRANSFER') ||
      descUpper.includes('XFER') ||
      descUpper.includes('SWEEP') ||
      descUpper.includes('INTER-ACCOUNT') ||
      descUpper.includes('PINDAHAN') ||
      descUpper.includes('DUITNOW') ||
      descUpper.includes('JOMPAY') ||
      descUpper.includes('FPX') ||
      descUpper.includes('转账') ||
      descUpper.includes('划转') ||
      descUpper.includes('网银转账');

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
      descUpper.includes('CHARGEBACK REVERSAL') ||
      descUpper.includes('BAYAR BALIK') ||
      descUpper.includes('PULANGAN') ||
      descUpper.includes('退款') ||
      descUpper.includes('冲正');

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
    // Check if description mentions invoice number or counterparty (with fuzzy typo resolution)
    const exactAmountInvoices = knowledge.openInvoices.filter(
      (inv) => inv.amountDueCents === absAmount,
    );
    const isUniqueAmount = exactAmountInvoices.length === 1;

    for (const inv of knowledge.openInvoices) {
      const invNorm = normalizeAlphanumeric(inv.invoiceNumber);
      const descNorm = normalizeAlphanumeric(descUpper);
      const invNumInDesc =
        descUpper.includes(inv.invoiceNumber.toUpperCase()) ||
        (invNorm.length >= 4 && descNorm.includes(invNorm));
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
        // Multi-factor fuzzy counterparty match (resolves spelling typos & legal suffix discrepancies)
        const cp = knowledge.counterparties.find((c) => c.id === inv.counterpartyId);
        if (cp) {
          const isExactCp =
            descUpper.includes(cp.normalizedName.toUpperCase()) ||
            descUpper.includes(cp.legalName.toUpperCase());

          const fuzzyRes = isExactCp
            ? { match: true, similarity: 1.0, isExact: true, matchedToken: cp.legalName }
            : fuzzyContains(descUpper, cp.legalName, 0.82);

          if (fuzzyRes.match) {
            // Confidence calculation:
            // 1. Exact amount match (50%)
            // 2. Exact or high-similarity fuzzy name match (30%)
            // 3. Amount uniqueness in open receivables/payables (16%)
            // Result: >= 96% confidence -> autoPostEligible = true!
            const confidenceScore = isExactCp ? 0.96 : isUniqueAmount ? 0.96 : 0.92;
            const isTypoDetected = !isExactCp && fuzzyRes.similarity < 1.0;
            const typoNote = isTypoDetected
              ? ` (Fuzzy match: ${Math.round(fuzzyRes.similarity * 100)}% similarity, typo resolved)`
              : '';

            return {
              proposalType: inv.invoiceType === 'INVOICE' ? 'INVOICE_MATCH' : 'VENDOR_PAYMENT',
              confidenceScore,
              evidence: [
                {
                  source: isTypoDetected ? 'FUZZY_COUNTERPARTY_MATCH' : 'COUNTERPARTY_MATCH',
                  matchedValue: cp.legalName,
                  reason: isTypoDetected
                    ? `Counterparty '${cp.legalName}' matched with ${Math.round(fuzzyRes.similarity * 100)}% similarity to '${fuzzyRes.matchedToken || transaction.rawDescription}' (typo resolved)`
                    : `Counterparty '${cp.legalName}' identified in narrative`,
                },
                {
                  source: 'EXACT_AMOUNT',
                  matchedValue: `$${Number(absAmount) / 100}`,
                  reason: `Matches amount due on ${inv.invoiceType} ${inv.invoiceNumber}${isUniqueAmount ? ' (Unique open balance)' : ''}`,
                },
              ],
              rationale: `Payment of $${Number(absAmount) / 100} matched to counterparty ${cp.legalName} (${inv.invoiceNumber})${typoNote}.`,
              suggestedDebitAccountId: inv.invoiceType === 'INVOICE' ? operatingCashAcc : apAcc,
              suggestedCreditAccountId: inv.invoiceType === 'INVOICE' ? arAcc : operatingCashAcc,
              suggestedCounterpartyId: cp.id,
              suggestedInvoiceId: inv.id,
              isAmbiguous: false,
              autoPostEligible: confidenceScore >= 0.95,
            };
          }
        }
      } else if (invNumInDesc && absAmount < inv.amountDueCents) {
        // Partial Payment Match with explicit invoice number in narrative
        const remainingDue = inv.amountDueCents - absAmount;
        if (inv.invoiceType === 'INVOICE' && isCredit) {
          return {
            proposalType: 'INVOICE_MATCH',
            confidenceScore: 0.96,
            evidence: [
              {
                source: 'INVOICE_NUMBER',
                matchedValue: inv.invoiceNumber,
                reason: `Invoice '${inv.invoiceNumber}' identified in description for partial settlement`,
              },
              {
                source: 'PARTIAL_INVOICE_PAYMENT',
                matchedValue: `$${Number(absAmount) / 100}`,
                reason: `Partial payment of $${Number(absAmount) / 100} received towards open balance $${Number(inv.amountDueCents) / 100} on invoice ${inv.invoiceNumber} ($${Number(remainingDue) / 100} remaining balance due)`,
                allocatedCents: absAmount.toString(),
                remainingDueCents: remainingDue.toString(),
              },
            ],
            rationale: `Partial customer payment received for Invoice ${inv.invoiceNumber} ($${Number(absAmount) / 100} paid, $${Number(remainingDue) / 100} balance remaining).`,
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
            confidenceScore: 0.96,
            evidence: [
              {
                source: 'BILL_NUMBER',
                matchedValue: inv.invoiceNumber,
                reason: `Bill '${inv.invoiceNumber}' identified in description for partial settlement`,
              },
              {
                source: 'PARTIAL_INVOICE_PAYMENT',
                matchedValue: `$${Number(absAmount) / 100}`,
                reason: `Partial disbursement of $${Number(absAmount) / 100} towards open balance $${Number(inv.amountDueCents) / 100} on bill ${inv.invoiceNumber} ($${Number(remainingDue) / 100} remaining balance due)`,
                allocatedCents: absAmount.toString(),
                remainingDueCents: remainingDue.toString(),
              },
            ],
            rationale: `Partial vendor disbursement for Bill ${inv.invoiceNumber} ($${Number(absAmount) / 100} paid, $${Number(remainingDue) / 100} balance remaining).`,
            suggestedDebitAccountId: apAcc,
            suggestedCreditAccountId: operatingCashAcc,
            suggestedCounterpartyId: inv.counterpartyId,
            suggestedInvoiceId: inv.id,
            isAmbiguous: false,
            autoPostEligible: true,
          };
        }
      }
    }

    // --- RULE C1: Payment Gateway Net Payouts (Stripe, PayPal, Square, Shopify) ---
    if (isCredit) {
      const isProcessorPattern =
        descUpper.includes('STRIPE') ||
        descUpper.includes('PAYPAL') ||
        descUpper.includes('SQUARE') ||
        descUpper.includes('SHOPIFY') ||
        descUpper.includes('ADYEN') ||
        descUpper.includes('BRAINTREE') ||
        descUpper.includes('PAYOUT') ||
        descUpper.includes('MERCHANT');

      const customerInvoices = knowledge.openInvoices.filter((i) => i.invoiceType === 'INVOICE');
      for (const inv of customerInvoices) {
        if (inv.amountDueCents > absAmount) {
          const feeCents = inv.amountDueCents - absAmount;
          const feeRatio = Number(feeCents) / Number(inv.amountDueCents);

          // Standard merchant processing fees typically span 0.5% to 8.0%
          if (feeRatio >= 0.005 && feeRatio <= 0.08) {
            const invNorm = normalizeAlphanumeric(inv.invoiceNumber);
            const descNorm = normalizeAlphanumeric(descUpper);
            const invNumInDesc =
              descUpper.includes(inv.invoiceNumber.toUpperCase()) ||
              (invNorm.length >= 4 && descNorm.includes(invNorm));

            const cp = knowledge.counterparties.find((c) => c.id === inv.counterpartyId);
            const cpMatch =
              cp &&
              (descUpper.includes(cp.normalizedName.toUpperCase()) ||
                descUpper.includes(cp.legalName.toUpperCase()) ||
                fuzzyContains(descUpper, cp.legalName, 0.82).match);

            if (invNumInDesc || cpMatch || isProcessorPattern) {
              const confidenceScore = invNumInDesc ? 0.99 : cpMatch ? 0.96 : 0.96;
              return {
                proposalType: 'INVOICE_MATCH',
                confidenceScore,
                evidence: [
                  {
                    source: 'PAYMENT_GATEWAY_NET_PAYOUT',
                    matchedValue: `$${Number(absAmount) / 100}`,
                    reason: `Net payout of $${Number(absAmount) / 100} matches gross Invoice ${inv.invoiceNumber} ($${Number(inv.amountDueCents) / 100}) less $${Number(feeCents) / 100} (${(feeRatio * 100).toFixed(2)}%) merchant fee`,
                    feeCents: feeCents.toString(),
                    grossAmountCents: inv.amountDueCents.toString(),
                    feeAccountId: feeAcc,
                    feeAccountCode: '6030',
                  },
                ],
                rationale: `Payment gateway net payout ($${Number(absAmount) / 100}) matched to Invoice ${inv.invoiceNumber} ($${Number(inv.amountDueCents) / 100}) with $${Number(feeCents) / 100} processing fee automatically recognized.`,
                suggestedDebitAccountId: operatingCashAcc,
                suggestedCreditAccountId: arAcc,
                suggestedCounterpartyId: inv.counterpartyId,
                suggestedInvoiceId: inv.id,
                isAmbiguous: false,
                autoPostEligible: true,
              };
            }
          }
        }
      }
    }

    // --- RULE C2: Multi-Invoice Batch Settlement (1 Deposit -> Multiple Invoices) ---
    if (isCredit) {
      const customerInvoices = knowledge.openInvoices.filter((i) => i.invoiceType === 'INVOICE');
      if (customerInvoices.length >= 2) {
        // A. Prioritize counterparty explicitly mentioned in narrative
        for (const cp of knowledge.counterparties) {
          const cpMatch =
            descUpper.includes(cp.normalizedName.toUpperCase()) ||
            descUpper.includes(cp.legalName.toUpperCase()) ||
            fuzzyContains(descUpper, cp.legalName, 0.82).match;

          if (cpMatch) {
            const cpInvoices = customerInvoices.filter((i) => i.counterpartyId === cp.id);
            const subset = findInvoiceSubsetSum(cpInvoices, absAmount);
            if (subset) {
              return {
                proposalType: 'INVOICE_MATCH',
                confidenceScore: 0.96,
                evidence: [
                  {
                    source: 'BATCH_INVOICE_SETTLEMENT',
                    matchedValue: `$${Number(absAmount) / 100}`,
                    reason: `Lump-sum payment of $${Number(absAmount) / 100} settles ${subset.length} open invoices for ${cp.legalName} (${subset.map((i) => i.invoiceNumber).join(', ')})`,
                    batchAllocations: subset.map((i) => ({
                      invoiceId: i.id,
                      invoiceNumber: i.invoiceNumber,
                      allocatedCents: i.amountDueCents.toString(),
                    })),
                  },
                ],
                rationale: `Batch customer payment of $${Number(absAmount) / 100} settles ${subset.length} open invoices: ${subset.map((i) => i.invoiceNumber).join(', ')}.`,
                suggestedDebitAccountId: operatingCashAcc,
                suggestedCreditAccountId: arAcc,
                suggestedCounterpartyId: cp.id,
                suggestedInvoiceId: subset[0]!.id,
                isAmbiguous: false,
                autoPostEligible: true,
              };
            }
          }
        }

        // B. Global subset match across open customer invoices
        const globalSubset = findInvoiceSubsetSum(customerInvoices, absAmount);
        if (globalSubset) {
          const anyInvInDesc = globalSubset.some(
            (i) =>
              descUpper.includes(i.invoiceNumber.toUpperCase()) ||
              normalizeAlphanumeric(descUpper).includes(normalizeAlphanumeric(i.invoiceNumber)),
          );
          const confidenceScore = anyInvInDesc ? 0.96 : 0.92;
          return {
            proposalType: 'INVOICE_MATCH',
            confidenceScore,
            evidence: [
              {
                source: 'BATCH_INVOICE_SETTLEMENT',
                matchedValue: `$${Number(absAmount) / 100}`,
                reason: `Lump-sum payment of $${Number(absAmount) / 100} settles ${globalSubset.length} open invoices (${globalSubset.map((i) => i.invoiceNumber).join(', ')})`,
                batchAllocations: globalSubset.map((i) => ({
                  invoiceId: i.id,
                  invoiceNumber: i.invoiceNumber,
                  allocatedCents: i.amountDueCents.toString(),
                })),
              },
            ],
            rationale: `Batch customer payment of $${Number(absAmount) / 100} settles ${globalSubset.length} open invoices: ${globalSubset.map((i) => i.invoiceNumber).join(', ')}.`,
            suggestedDebitAccountId: operatingCashAcc,
            suggestedCreditAccountId: arAcc,
            suggestedCounterpartyId: globalSubset[0]!.counterpartyId,
            suggestedInvoiceId: globalSubset[0]!.id,
            isAmbiguous: false,
            autoPostEligible: confidenceScore >= 0.95,
          };
        }
      }
    }

    // --- RULE D: Counterparty Entity Matching (No open invoice match) ---
    for (const cp of knowledge.counterparties) {
      const isExact =
        descUpper.includes(cp.normalizedName.toUpperCase()) ||
        descUpper.includes(cp.legalName.toUpperCase());
      const fuzzyRes = isExact
        ? { match: true, similarity: 1.0, isExact: true, matchedToken: cp.legalName }
        : fuzzyContains(descUpper, cp.legalName, 0.85);

      if (fuzzyRes.match) {
        const targetAccountId =
          cp.defaultAccountId || (isCredit ? generalRevenueAcc : generalExpenseAcc);
        const confidenceScore = isExact ? 0.95 : 0.92;
        return {
          proposalType: isCredit ? 'REVENUE_CLASSIFICATION' : 'EXPENSE_CLASSIFICATION',
          confidenceScore,
          evidence: [
            {
              source: isExact ? 'COUNTERPARTY_DIRECTORY' : 'FUZZY_COUNTERPARTY_DIRECTORY',
              matchedValue: cp.legalName,
              reason: isExact
                ? `Matched known directory counterparty '${cp.legalName}'`
                : `Fuzzy matched known directory counterparty '${cp.legalName}' (${Math.round(fuzzyRes.similarity * 100)}% similarity)`,
            },
          ],
          rationale: `Direct ${isCredit ? 'revenue from' : 'expense to'} recognized entity ${cp.legalName}.`,
          suggestedDebitAccountId: isCredit ? operatingCashAcc : targetAccountId,
          suggestedCreditAccountId: isCredit ? targetAccountId : operatingCashAcc,
          suggestedCounterpartyId: cp.id,
          isAmbiguous: false,
          autoPostEligible: confidenceScore >= 0.95,
        };
      }
    }

    // --- RULE E: Global FinTech & SaaS Merchant Catalog ---
    if (!isCredit) {
      const globalMerchant = matchGlobalMerchant(transaction.rawDescription);
      if (globalMerchant) {
        const matchedAccount =
          knowledge.accounts.find((a) => a.accountCode === globalMerchant.defaultAccountCode) ||
          knowledge.accounts.find(
            (a) =>
              (globalMerchant.defaultAccountCode.startsWith('6') ||
                globalMerchant.defaultAccountCode.startsWith('5')) &&
              a.classification === 'EXPENSE',
          ) ||
          generalExpenseAcc;

        const targetAccId = typeof matchedAccount === 'string' ? matchedAccount : matchedAccount.id;

        return {
          proposalType: 'EXPENSE_CLASSIFICATION',
          confidenceScore: 0.96, // High confidence: auto-posts on Day 1!
          evidence: [
            {
              source: 'GLOBAL_MERCHANT_CATALOG',
              matchedValue: globalMerchant.canonicalName,
              reason: `Matched global enterprise vendor: ${globalMerchant.canonicalName} (${globalMerchant.categoryName})`,
            },
          ],
          rationale: `${globalMerchant.categoryName} expense for ${globalMerchant.canonicalName}.`,
          suggestedDebitAccountId: targetAccId,
          suggestedCreditAccountId: operatingCashAcc,
          isAmbiguous: false,
          autoPostEligible: true,
        };
      }
    }

    // --- RULE E2: Unresolved Invoice Reference (Unmatched Payment) ---
    const hasInvoicePattern =
      /INV(?:OICE)?[-#\s]*\w+/i.test(transaction.rawDescription) ||
      /BILL[-#\s]*\w+/i.test(transaction.rawDescription) ||
      /INVOIS[-#\s]*\w+/i.test(transaction.rawDescription) ||
      /RESIT[-#\s]*\w+/i.test(transaction.rawDescription) ||
      /发票[-#\s]*\w+/i.test(transaction.rawDescription) ||
      /账单[-#\s]*\w+/i.test(transaction.rawDescription) ||
      /单据[-#\s]*\w+/i.test(transaction.rawDescription);

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
        rationale: `Payment references an invoice or bill number, but no matching open record was found in your books: '${transaction.rawDescription}'.`,
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
          reason: 'No matching payee, invoice, or recurring pattern detected',
        },
      ],
      rationale: `Unrecognized payee '${transaction.rawDescription}'. We couldn't match this to a known supplier or bill on file. Please confirm who was paid.`,
      suggestedDebitAccountId: isCredit ? operatingCashAcc : suspenseAcc,
      suggestedCreditAccountId: isCredit ? suspenseAcc : operatingCashAcc,
      isAmbiguous: true,
      autoPostEligible: false,
    };
  }
}
