import { describe, it, expect, beforeEach } from 'vitest';

import { AiAccountantService } from '../../src/modules/banking/services/ai-accountant.service';

import type { AiGatewayService } from '../../src/core/ai/ai-gateway.service';
import type { BankAccountEntity } from '../../src/modules/banking/domain/bank-account.entity';
import type { BankTransactionEntity } from '../../src/modules/banking/domain/bank-transaction.entity';
import type { CounterpartyEntity } from '../../src/modules/counterparties/domain/counterparty.entity';
import type { InvoiceEntity } from '../../src/modules/invoices/domain/invoice.entity';
import type { AccountEntity } from '../../src/modules/ledger/domain/account.entity';

describe('AiAccountantService: Fuzzy Settlement & Global Merchant Catalog', () => {
  let service: AiAccountantService;
  let mockAiGateway: AiGatewayService;

  const mockBankAccount: BankAccountEntity = {
    id: 'bank-acc-1',
    tenantId: 'tenant-1',
    ledgerAccountId: 'ledger-cash-1010',
    accountName: 'Operating Checking',
    institutionName: 'Chase Bank',
    accountType: 'CHECKING',
    currency: 'USD',
    accountNumberLast4: '4092',
    currentBalanceCents: 10000000n,
    reconciledBalanceCents: 10000000n,
    isActive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAccounts: AccountEntity[] = [
    {
      id: 'ledger-cash-1010',
      tenantId: 'tenant-1',
      accountCode: '1010',
      name: 'Cash and Cash Equivalents',
      classification: 'ASSET',
      isActive: true,
      isSystemLocked: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ledger-ar-1200',
      tenantId: 'tenant-1',
      accountCode: '1200',
      name: 'Accounts Receivable',
      classification: 'ASSET',
      isActive: true,
      isSystemLocked: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ledger-ap-2010',
      tenantId: 'tenant-1',
      accountCode: '2010',
      name: 'Accounts Payable',
      classification: 'LIABILITY',
      isActive: true,
      isSystemLocked: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ledger-cloud-6010',
      tenantId: 'tenant-1',
      accountCode: '6010',
      name: 'Software, Cloud & SaaS Subscriptions',
      classification: 'EXPENSE',
      isActive: true,
      isSystemLocked: false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ledger-fees-6030',
      tenantId: 'tenant-1',
      accountCode: '6030',
      name: 'Bank Charges & Payment Processing Fees',
      classification: 'EXPENSE',
      isActive: true,
      isSystemLocked: false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ledger-travel-6050',
      tenantId: 'tenant-1',
      accountCode: '6050',
      name: 'Travel, Meals & Entertainment',
      classification: 'EXPENSE',
      isActive: true,
      isSystemLocked: false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    mockAiGateway = {} as unknown as AiGatewayService;
    service = new AiAccountantService(mockAiGateway);
  });

  describe('Typo-Resilient Invoice Settlement (Problem 2)', () => {
    it('should match and settle an invoice even when user misspelled counterparty name ("Staright Corp" vs "STARLIGHT CORP")', async () => {
      // Counterparty created with typo: "Staright Corp"
      const cpWithTypo: CounterpartyEntity = {
        id: 'cp-staright',
        tenantId: 'tenant-1',
        type: 'CUSTOMER',
        legalName: 'Staright Corp',
        normalizedName: 'staright corp',
        paymentTermsDays: 30,
        isActive: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Open Invoice for $5,000.00 (500000 cents) issued to "Staright Corp"
      const openInvoice: InvoiceEntity = {
        id: 'inv-starlight-001',
        tenantId: 'tenant-1',
        counterpartyId: 'cp-staright',
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-2026-STARLIGHT',
        status: 'POSTED',
        issueDate: '2026-10-01',
        dueDate: '2026-10-31',
        currency: 'USD',
        subtotalCents: 500000n,
        taxCents: 0n,
        totalCents: 500000n,
        amountDueCents: 500000n,
        lines: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Bank Statement Deposit from "STARLIGHT CORP" for $5,000.00
      const bankDepositTx: BankTransactionEntity = {
        id: 'tx-dep-1',
        tenantId: 'tenant-1',
        bankStatementId: 'stmt-1',
        bankAccountId: 'bank-acc-1',
        pageNumber: 1,
        sourceSequence: 1,
        sourceRowIndex: 0,
        transactionDate: '2026-10-15',
        direction: 'CREDIT',
        amountCents: 500000n, // $5,000.00
        signedAmountCents: 500000n,
        rawDescription: 'WIRE TRANSFER INCOMING FROM STARLIGHT CORP - REF 881923',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-starlight-1',
        status: 'UNRECONCILED',
        createdAt: new Date(),
      };

      const result = await service.evaluateTransaction('tenant-1', bankDepositTx, {
        bankAccount: mockBankAccount,
        otherBankAccounts: [],
        counterparties: [cpWithTypo],
        openInvoices: [openInvoice],
        accounts: mockAccounts,
      });

      // Assertions
      expect(result.proposalType).toBe('INVOICE_MATCH');
      expect(result.suggestedInvoiceId).toBe('inv-starlight-001');
      expect(result.suggestedCounterpartyId).toBe('cp-staright');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.95);
      expect(result.autoPostEligible).toBe(true);
      expect(result.isAmbiguous).toBe(false);

      // Verify Debit Cash 1010, Credit AR 1200
      expect(result.suggestedDebitAccountId).toBe('ledger-cash-1010');
      expect(result.suggestedCreditAccountId).toBe('ledger-ar-1200');

      // Verify evidence recorded the fuzzy match
      const fuzzyEvidence = result.evidence.find(
        (e) => e.source === 'FUZZY_COUNTERPARTY_MATCH' || e.source === 'COUNTERPARTY_MATCH',
      );
      expect(fuzzyEvidence).toBeDefined();
    });

    it('should match by punctuation-normalized invoice number (INV2026001 vs INV-2026-001)', async () => {
      const openInvoice: InvoiceEntity = {
        id: 'inv-num-test',
        tenantId: 'tenant-1',
        counterpartyId: 'cp-unknown',
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-2026-001',
        status: 'POSTED',
        issueDate: '2026-10-01',
        dueDate: '2026-10-31',
        currency: 'USD',
        subtotalCents: 150000n,
        taxCents: 0n,
        totalCents: 150000n,
        amountDueCents: 150000n,
        lines: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Bank wire omitted the dashes: "PAYMENT FOR INV2026001"
      const bankDepositTx: BankTransactionEntity = {
        id: 'tx-inv-num',
        tenantId: 'tenant-1',
        bankStatementId: 'stmt-1',
        bankAccountId: 'bank-acc-1',
        pageNumber: 1,
        sourceSequence: 2,
        sourceRowIndex: 0,
        transactionDate: '2026-10-10',
        direction: 'CREDIT',
        amountCents: 150000n, // $1,500.00
        signedAmountCents: 150000n,
        rawDescription: 'DIRECT DEPOSIT PAYMENT FOR INV2026001',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-inv-2',
        status: 'UNRECONCILED',
        createdAt: new Date(),
      };

      const result = await service.evaluateTransaction('tenant-1', bankDepositTx, {
        bankAccount: mockBankAccount,
        otherBankAccounts: [],
        counterparties: [],
        openInvoices: [openInvoice],
        accounts: mockAccounts,
      });

      expect(result.proposalType).toBe('INVOICE_MATCH');
      expect(result.suggestedInvoiceId).toBe('inv-num-test');
      expect(result.confidenceScore).toBe(0.99);
      expect(result.autoPostEligible).toBe(true);
    });
  });

  describe('Global Merchant Catalog (Problem 1: Cold-Start Exception Flood)', () => {
    it('should automatically classify AWS hosting at 96% confidence and auto-post without human review', async () => {
      const awsTx: BankTransactionEntity = {
        id: 'tx-aws',
        tenantId: 'tenant-1',
        bankStatementId: 'stmt-1',
        bankAccountId: 'bank-acc-1',
        pageNumber: 1,
        sourceSequence: 3,
        sourceRowIndex: 0,
        transactionDate: '2026-10-05',
        direction: 'DEBIT',
        amountCents: -14250n, // $142.50
        signedAmountCents: -14250n,
        rawDescription: 'AMAZON WEB SERVICES AWS.AMAZON.COM WA',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-aws-1',
        status: 'UNRECONCILED',
        createdAt: new Date(),
      };

      const result = await service.evaluateTransaction('tenant-1', awsTx, {
        bankAccount: mockBankAccount,
        otherBankAccounts: [],
        counterparties: [], // No prior counterparty in directory!
        openInvoices: [],
        accounts: mockAccounts,
      });

      expect(result.proposalType).toBe('EXPENSE_CLASSIFICATION');
      expect(result.suggestedDebitAccountId).toBe('ledger-cloud-6010');
      expect(result.suggestedCreditAccountId).toBe('ledger-cash-1010');
      expect(result.confidenceScore).toBe(0.96);
      expect(result.autoPostEligible).toBe(true);
      expect(result.isAmbiguous).toBe(false);

      const catalogEvidence = result.evidence.find((e) => e.source === 'GLOBAL_MERCHANT_CATALOG');
      expect(catalogEvidence).toBeDefined();
      expect(catalogEvidence?.matchedValue).toContain('Amazon Web Services');
    });

    it('should automatically classify Stripe processing fees to Account 6030', async () => {
      const stripeTx: BankTransactionEntity = {
        id: 'tx-stripe-fee',
        tenantId: 'tenant-1',
        bankStatementId: 'stmt-1',
        bankAccountId: 'bank-acc-1',
        pageNumber: 1,
        sourceSequence: 4,
        sourceRowIndex: 0,
        transactionDate: '2026-10-08',
        direction: 'DEBIT',
        amountCents: -1500n, // $15.00
        signedAmountCents: -1500n,
        rawDescription: 'STRIPE PROCESSING FEE MONTHLY',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-stripe-fee',
        status: 'UNRECONCILED',
        createdAt: new Date(),
      };

      const result = await service.evaluateTransaction('tenant-1', stripeTx, {
        bankAccount: mockBankAccount,
        otherBankAccounts: [],
        counterparties: [],
        openInvoices: [],
        accounts: mockAccounts,
      });

      expect(result.proposalType).toBe('EXPENSE_CLASSIFICATION');
      expect(result.suggestedDebitAccountId).toBe('ledger-fees-6030');
      expect(result.confidenceScore).toBe(0.96);
      expect(result.autoPostEligible).toBe(true);
    });

    it('should automatically classify Uber rides to Account 6050 (Travel & Meals)', async () => {
      const uberTx: BankTransactionEntity = {
        id: 'tx-uber',
        tenantId: 'tenant-1',
        bankStatementId: 'stmt-1',
        bankAccountId: 'bank-acc-1',
        pageNumber: 1,
        sourceSequence: 5,
        sourceRowIndex: 0,
        transactionDate: '2026-10-12',
        direction: 'DEBIT',
        amountCents: -3450n, // $34.50
        signedAmountCents: -3450n,
        rawDescription: 'UBER *TRIP 9821 SAN FRANCISCO CA',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-uber-1',
        status: 'UNRECONCILED',
        createdAt: new Date(),
      };

      const result = await service.evaluateTransaction('tenant-1', uberTx, {
        bankAccount: mockBankAccount,
        otherBankAccounts: [],
        counterparties: [],
        openInvoices: [],
        accounts: mockAccounts,
      });

      expect(result.proposalType).toBe('EXPENSE_CLASSIFICATION');
      expect(result.suggestedDebitAccountId).toBe('ledger-travel-6050');
      expect(result.confidenceScore).toBe(0.96);
      expect(result.autoPostEligible).toBe(true);
    });

    it('should safely quarantine completely unknown payees to the Exception Center (< 95% confidence)', async () => {
      const unknownTx: BankTransactionEntity = {
        id: 'tx-unknown',
        tenantId: 'tenant-1',
        bankStatementId: 'stmt-1',
        bankAccountId: 'bank-acc-1',
        pageNumber: 1,
        sourceSequence: 6,
        sourceRowIndex: 0,
        transactionDate: '2026-10-14',
        direction: 'DEBIT',
        amountCents: -50000n, // $500.00
        signedAmountCents: -50000n,
        rawDescription: 'MYSTERIOUS UNREGISTERED ENTITY 991823',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'MEDIUM',
        transactionHash: 'hash-unknown-1',
        status: 'UNRECONCILED',
        createdAt: new Date(),
      };

      const result = await service.evaluateTransaction('tenant-1', unknownTx, {
        bankAccount: mockBankAccount,
        otherBankAccounts: [],
        counterparties: [],
        openInvoices: [],
        accounts: mockAccounts,
      });

      expect(result.proposalType).toBe('AMBIGUOUS');
      expect(result.confidenceScore).toBeLessThan(0.95);
      expect(result.autoPostEligible).toBe(false);
      expect(result.isAmbiguous).toBe(true);
    });
  });
});
