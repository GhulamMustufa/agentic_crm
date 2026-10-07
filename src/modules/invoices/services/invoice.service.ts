import { Inject, Injectable } from '@nestjs/common';

import {
  ValidationError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../../core/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import {
  COUNTERPARTY_REPOSITORY_TOKEN,
  type ICounterpartyRepository,
} from '../../counterparties/domain/counterparty.repository.interface';
import { LedgerService } from '../../ledger/services/ledger.service';
import {
  INVOICE_REPOSITORY_TOKEN,
  type IInvoiceRepository,
} from '../domain/invoice.repository.interface';
import {
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
  type RecordPaymentInput,
  type VoidInvoiceInput,
  createInvoiceSchema,
  updateInvoiceSchema,
  recordPaymentSchema,
  voidInvoiceSchema,
} from '../dto/invoice.dto';

import type { InvoiceEntity, InvoiceType, InvoiceStatus } from '../domain/invoice.entity';
import type { PaymentEntity } from '../domain/payment.entity';

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(INVOICE_REPOSITORY_TOKEN)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(COUNTERPARTY_REPOSITORY_TOKEN)
    private readonly counterpartyRepo: ICounterpartyRepository,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
  ) {}

  async createInvoice(tenantId: string, rawDto: CreateInvoiceInput): Promise<InvoiceEntity> {
    const parseResult = createInvoiceSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Invoice validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // Verify counterparty
    const counterparty = await this.counterpartyRepo.findById(tenantId, dto.counterpartyId);
    if (!counterparty) {
      throw new NotFoundError('Counterparty', dto.counterpartyId);
    }

    // Deterministic monetary computation for line items
    let subtotalCents = 0n;
    const computedLines = dto.lines.map((line, idx) => {
      // Precision: round quantity to 4 decimal places, calculate exact integer cents
      const quantityUnits = BigInt(Math.round(line.quantity * 10000));
      const lineTotal = (quantityUnits * line.unitCostCents) / 10000n;
      subtotalCents += lineTotal;
      return {
        accountId: line.accountId,
        lineNumber: idx + 1,
        description: line.description,
        quantity: line.quantity,
        unitCostCents: line.unitCostCents,
        totalCents: lineTotal,
      };
    });

    const taxCents = dto.taxCents || 0n;
    const totalCents = subtotalCents + taxCents;

    return this.invoiceRepo.createInvoice({
      tenantId,
      counterpartyId: dto.counterpartyId,
      invoiceType: dto.invoiceType,
      invoiceNumber: dto.invoiceNumber,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      currency: dto.currency,
      subtotalCents,
      taxCents,
      totalCents,
      amountDueCents: totalCents,
      lines: computedLines,
    });
  }

  async updateInvoice(
    tenantId: string,
    userId: string,
    invoiceId: string,
    rawDto: UpdateInvoiceInput,
  ): Promise<InvoiceEntity> {
    const existing = await this.invoiceRepo.findInvoiceById(tenantId, invoiceId);
    if (!existing) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    if (existing.status !== 'DRAFT') {
      throw new UnprocessableEntityError(
        `Cannot edit invoice in status '${existing.status}'. Only DRAFT invoices can be edited. Void the invoice to reverse ledger entries.`,
      );
    }

    const parseResult = updateInvoiceSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Invoice validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // Verify counterparty
    const counterparty = await this.counterpartyRepo.findById(tenantId, dto.counterpartyId);
    if (!counterparty) {
      throw new NotFoundError('Counterparty', dto.counterpartyId);
    }

    // Deterministic monetary computation for line items
    let subtotalCents = 0n;
    const computedLines = dto.lines.map((line, idx) => {
      const quantityUnits = BigInt(Math.round(line.quantity * 10000));
      const lineTotal = (quantityUnits * line.unitCostCents) / 10000n;
      subtotalCents += lineTotal;
      return {
        accountId: line.accountId,
        lineNumber: idx + 1,
        description: line.description,
        quantity: line.quantity,
        unitCostCents: line.unitCostCents,
        totalCents: lineTotal,
      };
    });

    const taxCents = dto.taxCents || 0n;
    const totalCents = subtotalCents + taxCents;

    const updated = await this.invoiceRepo.updateInvoice(tenantId, invoiceId, {
      tenantId,
      counterpartyId: dto.counterpartyId,
      invoiceType: dto.invoiceType,
      invoiceNumber: dto.invoiceNumber,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      currency: dto.currency,
      subtotalCents,
      taxCents,
      totalCents,
      amountDueCents: totalCents,
      lines: computedLines,
    });

    await this.auditService.recordEvent({
      tenantId,
      action: 'INVOICE_UPDATED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      actorType: 'USER',
      actorId: userId,
      newState: {
        totalCents: totalCents.toString(),
        linesCount: computedLines.length,
      },
    });

    return updated;
  }

  async postInvoice(tenantId: string, userId: string, invoiceId: string): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findInvoiceById(tenantId, invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'APPROVED') {
      throw new UnprocessableEntityError(`Cannot post invoice with status '${invoice.status}'`);
    }

    // Look up required standard accounts
    const arAccount = await this.ledgerService.findAccountByCode(tenantId, '1200');
    const apAccount = await this.ledgerService.findAccountByCode(tenantId, '2010');
    const salesTaxAccount = await this.ledgerService.findAccountByCode(tenantId, '2200');

    if (!arAccount || !apAccount) {
      throw new UnprocessableEntityError(
        'Required control accounts (1200 AR or 2010 AP) not found in Chart of Accounts.',
      );
    }

    let journalEntry;
    if (invoice.invoiceType === 'INVOICE') {
      // Customer Invoice (AR):
      // Debit: Accounts Receivable (1200) for total
      // Credit: Line Revenue Accounts
      // Credit: Sales Tax Payable (2200) if tax > 0
      const lines = [
        {
          accountId: arAccount.id,
          debitCents: invoice.totalCents,
          creditCents: 0n,
          memo: `AR - Invoice ${invoice.invoiceNumber}`,
        },
        ...invoice.lines.map((l) => ({
          accountId: l.accountId,
          debitCents: 0n,
          creditCents: l.totalCents,
          memo: l.description,
        })),
      ];

      if (invoice.taxCents > 0n && salesTaxAccount) {
        lines.push({
          accountId: salesTaxAccount.id,
          debitCents: 0n,
          creditCents: invoice.taxCents,
          memo: `Sales Tax - Invoice ${invoice.invoiceNumber}`,
        });
      }

      journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: invoice.issueDate,
        description: `Customer Invoice ${invoice.invoiceNumber}`,
        sourceType: 'INVOICE',
        sourceId: invoice.id,
        lines,
      });
    } else {
      // Vendor Bill / Expense (AP):
      // Debit: Line Expense Accounts
      // Debit: Sales Tax / Expense if tax > 0
      // Credit: Accounts Payable (2010) for total
      const lines = [
        ...invoice.lines.map((l) => ({
          accountId: l.accountId,
          debitCents: l.totalCents,
          creditCents: 0n,
          memo: l.description,
        })),
      ];

      if (invoice.taxCents > 0n && salesTaxAccount) {
        lines.push({
          accountId: salesTaxAccount.id,
          debitCents: invoice.taxCents,
          creditCents: 0n,
          memo: `Tax - Bill ${invoice.invoiceNumber}`,
        });
      }

      lines.push({
        accountId: apAccount.id,
        debitCents: 0n,
        creditCents: invoice.totalCents,
        memo: `AP - Bill ${invoice.invoiceNumber}`,
      });

      journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: invoice.issueDate,
        description: `Vendor Bill ${invoice.invoiceNumber}`,
        sourceType: 'BILL',
        sourceId: invoice.id,
        lines,
      });
    }

    await this.invoiceRepo.linkJournalEntry(tenantId, invoice.id, journalEntry.id);
    const updated = await this.invoiceRepo.updateInvoiceStatus(tenantId, invoice.id, 'POSTED');

    await this.auditService.recordEvent({
      tenantId,
      action: 'INVOICE_POSTED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      actorType: 'USER',
      actorId: userId,
      newState: {
        status: 'POSTED',
        journalEntryId: journalEntry.id,
        totalCents: invoice.totalCents.toString(),
      },
    });

    return updated;
  }

  async recordPayment(
    tenantId: string,
    userId: string,
    rawDto: RecordPaymentInput,
  ): Promise<PaymentEntity> {
    const parseResult = recordPaymentSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Payment validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // Validate payment account exists
    const paymentAccount = await this.ledgerService.findAccountByCode(tenantId, '1010');
    if (!paymentAccount) {
      throw new UnprocessableEntityError('Default operating cash account (1010) not found');
    }

    const arAccount = await this.ledgerService.findAccountByCode(tenantId, '1200');
    const apAccount = await this.ledgerService.findAccountByCode(tenantId, '2010');

    // 1. Validate allocations against invoices
    let totalAllocated = 0n;
    const validatedInvoices: Array<{ invoice: InvoiceEntity; allocatedCents: bigint }> = [];

    if (dto.allocations && dto.allocations.length > 0) {
      for (const alloc of dto.allocations) {
        const inv = await this.invoiceRepo.findInvoiceById(tenantId, alloc.invoiceId);
        if (!inv) {
          throw new NotFoundError('Invoice', alloc.invoiceId);
        }
        if (inv.status !== 'POSTED' && inv.status !== 'PARTIALLY_PAID') {
          throw new UnprocessableEntityError(
            `Invoice ${inv.invoiceNumber} is in status '${inv.status}' and cannot receive payments.`,
          );
        }
        if (alloc.allocatedAmountCents > inv.amountDueCents) {
          throw new UnprocessableEntityError(
            `Allocation of $${Number(alloc.allocatedAmountCents) / 100} exceeds amount due of $${Number(inv.amountDueCents) / 100} on invoice ${inv.invoiceNumber}`,
          );
        }
        totalAllocated += alloc.allocatedAmountCents;
        validatedInvoices.push({ invoice: inv, allocatedCents: alloc.allocatedAmountCents });
      }

      if (totalAllocated > dto.amountCents) {
        throw new UnprocessableEntityError(
          `Total allocated amount ($${Number(totalAllocated) / 100}) cannot exceed payment amount ($${Number(dto.amountCents) / 100})`,
        );
      }
    }

    // 2. Post Double-Entry Journal Entry
    let journalEntry;
    if (dto.paymentType === 'RECEIPT') {
      // Inbound Customer Payment:
      // Debit: Operating Cash (1010)
      // Credit: Accounts Receivable (1200)
      if (!arAccount) {
        throw new UnprocessableEntityError('AR account (1200) required for receipt');
      }
      journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: dto.paymentDate,
        description: `Customer Payment Receipt - Ref ${dto.referenceNumber || 'N/A'}`,
        sourceType: 'PAYMENT',
        lines: [
          {
            accountId: dto.paymentAccountId,
            debitCents: dto.amountCents,
            creditCents: 0n,
            memo: 'Cash received',
          },
          {
            accountId: arAccount.id,
            debitCents: 0n,
            creditCents: dto.amountCents,
            memo: 'AR settled',
          },
        ],
      });
    } else {
      // Outbound Vendor Disbursement:
      // Debit: Accounts Payable (2010)
      // Credit: Operating Cash (1010)
      if (!apAccount) {
        throw new UnprocessableEntityError('AP account (2010) required for disbursement');
      }
      journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: dto.paymentDate,
        description: `Vendor Payment Disbursement - Ref ${dto.referenceNumber || 'N/A'}`,
        sourceType: 'PAYMENT',
        lines: [
          {
            accountId: apAccount.id,
            debitCents: dto.amountCents,
            creditCents: 0n,
            memo: 'AP settled',
          },
          {
            accountId: dto.paymentAccountId,
            debitCents: 0n,
            creditCents: dto.amountCents,
            memo: 'Cash disbursed',
          },
        ],
      });
    }

    // 3. Persist Payment and Allocations
    const payment = await this.invoiceRepo.createPayment({
      tenantId,
      counterpartyId: dto.counterpartyId,
      paymentAccountId: dto.paymentAccountId,
      paymentType: dto.paymentType,
      paymentDate: dto.paymentDate,
      amountCents: dto.amountCents,
      paymentMethod: dto.paymentMethod,
      referenceNumber: dto.referenceNumber,
      allocations: dto.allocations,
    });

    await this.invoiceRepo.linkPaymentJournalEntry(tenantId, payment.id, journalEntry.id);
    payment.journalEntryId = journalEntry.id;

    // 4. Update Invoices amounts due & status
    for (const item of validatedInvoices) {
      const newAmountDue = item.invoice.amountDueCents - item.allocatedCents;
      await this.invoiceRepo.updateInvoiceAmountDue(tenantId, item.invoice.id, newAmountDue);
      const newStatus = newAmountDue === 0n ? 'PAID' : 'PARTIALLY_PAID';
      await this.invoiceRepo.updateInvoiceStatus(tenantId, item.invoice.id, newStatus);
    }

    // 5. Record Audit Event
    await this.auditService.recordEvent({
      tenantId,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: payment.id,
      actorType: 'USER',
      actorId: userId,
      newState: {
        paymentType: payment.paymentType,
        amountCents: payment.amountCents.toString(),
        allocationsCount: payment.allocations.length,
      },
    });

    return payment;
  }

  async voidInvoice(
    tenantId: string,
    userId: string,
    invoiceId: string,
    rawDto: VoidInvoiceInput,
  ): Promise<InvoiceEntity> {
    const parseResult = voidInvoiceSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Void validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const invoice = await this.invoiceRepo.findInvoiceById(tenantId, invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    if (invoice.status === 'VOID') {
      throw new UnprocessableEntityError('Invoice is already void');
    }

    const allocations = await this.invoiceRepo.listAllocationsForInvoice(tenantId, invoiceId);
    if (allocations.length > 0) {
      throw new UnprocessableEntityError(
        'Cannot void invoice with existing payments. Reverse allocations first.',
      );
    }

    // If posted, reverse the ledger journal entry
    if (invoice.journalEntryId) {
      await this.ledgerService.reverseJournalEntry(tenantId, userId, invoice.journalEntryId, {
        reason: `Invoice ${invoice.invoiceNumber} voided: ${dto.reason}`,
        reversalDate: invoice.issueDate,
      });
    }

    const updated = await this.invoiceRepo.updateInvoiceStatus(tenantId, invoice.id, 'VOID');

    await this.auditService.recordEvent({
      tenantId,
      action: 'INVOICE_VOIDED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      actorType: 'USER',
      actorId: userId,
      previousState: { status: invoice.status },
      newState: { status: 'VOID', reason: dto.reason },
    });

    return updated;
  }

  async getInvoiceById(tenantId: string, id: string): Promise<InvoiceEntity | null> {
    return this.invoiceRepo.findInvoiceById(tenantId, id);
  }

  async listInvoices(
    tenantId: string,
    options?: { counterpartyId?: string; type?: InvoiceType; status?: InvoiceStatus },
  ): Promise<InvoiceEntity[]> {
    return this.invoiceRepo.listInvoices(tenantId, options);
  }

  async listPayments(tenantId: string, counterpartyId?: string): Promise<PaymentEntity[]> {
    return this.invoiceRepo.listPayments(tenantId, counterpartyId);
  }
}
