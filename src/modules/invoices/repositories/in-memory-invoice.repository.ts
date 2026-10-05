import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';

import type { InvoiceEntity, InvoiceStatus, InvoiceType } from '../domain/invoice.entity';
import type {
  IInvoiceRepository,
  CreateInvoiceInput,
  CreatePaymentInput,
} from '../domain/invoice.repository.interface';
import type { PaymentEntity, PaymentAllocationEntity } from '../domain/payment.entity';

@Injectable()
export class InMemoryInvoiceRepository implements IInvoiceRepository {
  private readonly invoices = new Map<string, InvoiceEntity>();
  private readonly payments = new Map<string, PaymentEntity>();
  private readonly allocations = new Map<string, PaymentAllocationEntity>();

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceEntity> {
    const existing = await this.findInvoiceByNumber(
      input.tenantId,
      input.counterpartyId,
      input.invoiceType,
      input.invoiceNumber,
    );
    if (existing) {
      throw new ConflictError(
        `Invoice number '${input.invoiceNumber}' already exists for this counterparty`,
      );
    }

    const id = uuidv4();
    const now = new Date();

    const lines = input.lines.map((l) => ({
      id: uuidv4(),
      tenantId: input.tenantId,
      invoiceId: id,
      accountId: l.accountId,
      lineNumber: l.lineNumber,
      description: l.description,
      quantity: l.quantity,
      unitCostCents: l.unitCostCents,
      totalCents: l.totalCents,
      createdAt: now,
    }));

    const entity: InvoiceEntity = {
      id,
      tenantId: input.tenantId,
      counterpartyId: input.counterpartyId,
      sourceDocumentId: input.sourceDocumentId,
      invoiceType: input.invoiceType,
      invoiceNumber: input.invoiceNumber.trim(),
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: input.currency.toUpperCase(),
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      totalCents: input.totalCents,
      amountDueCents: input.amountDueCents,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
      version: 1,
      lines,
    };

    this.invoices.set(id, { ...entity, lines: [...lines] });
    return { ...entity, lines: [...lines] };
  }

  async findInvoiceById(tenantId: string, id: string): Promise<InvoiceEntity | null> {
    const item = this.invoices.get(id);
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return { ...item, lines: item.lines.map((l) => ({ ...l })) };
  }

  async findInvoiceByNumber(
    tenantId: string,
    counterpartyId: string,
    invoiceType: InvoiceType,
    invoiceNumber: string,
  ): Promise<InvoiceEntity | null> {
    for (const item of this.invoices.values()) {
      if (
        item.tenantId === tenantId &&
        item.counterpartyId === counterpartyId &&
        item.invoiceType === invoiceType &&
        item.invoiceNumber.toLowerCase() === invoiceNumber.toLowerCase()
      ) {
        return { ...item, lines: item.lines.map((l) => ({ ...l })) };
      }
    }
    return null;
  }

  async listInvoices(
    tenantId: string,
    options?: { counterpartyId?: string; type?: InvoiceType; status?: InvoiceStatus },
  ): Promise<InvoiceEntity[]> {
    return Array.from(this.invoices.values())
      .filter((inv) => {
        if (inv.tenantId !== tenantId) {
          return false;
        }
        if (options?.counterpartyId && inv.counterpartyId !== options.counterpartyId) {
          return false;
        }
        if (options?.type && inv.invoiceType !== options.type) {
          return false;
        }
        if (options?.status && inv.status !== options.status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
      .map((inv) => ({ ...inv, lines: inv.lines.map((l) => ({ ...l })) }));
  }

  async updateInvoiceStatus(
    tenantId: string,
    id: string,
    status: InvoiceStatus,
  ): Promise<InvoiceEntity> {
    const item = await this.findInvoiceById(tenantId, id);
    if (!item) {
      throw new NotFoundError('Invoice', id);
    }

    const updated: InvoiceEntity = {
      ...item,
      status,
      updatedAt: new Date(),
      version: item.version + 1,
    };

    this.invoices.set(id, { ...updated });
    return { ...updated };
  }

  async updateInvoiceAmountDue(
    tenantId: string,
    id: string,
    amountDueCents: bigint,
  ): Promise<InvoiceEntity> {
    const item = await this.findInvoiceById(tenantId, id);
    if (!item) {
      throw new NotFoundError('Invoice', id);
    }

    const updated: InvoiceEntity = {
      ...item,
      amountDueCents,
      updatedAt: new Date(),
      version: item.version + 1,
    };

    this.invoices.set(id, { ...updated });
    return { ...updated };
  }

  async linkJournalEntry(
    tenantId: string,
    invoiceId: string,
    journalEntryId: string,
  ): Promise<InvoiceEntity> {
    const item = await this.findInvoiceById(tenantId, invoiceId);
    if (!item) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const updated: InvoiceEntity = {
      ...item,
      journalEntryId,
      updatedAt: new Date(),
      version: item.version + 1,
    };

    this.invoices.set(invoiceId, { ...updated });
    return { ...updated };
  }

  // Payments
  async createPayment(input: CreatePaymentInput): Promise<PaymentEntity> {
    const id = uuidv4();
    const now = new Date();

    const allocations: PaymentAllocationEntity[] = [];
    if (input.allocations) {
      for (const a of input.allocations) {
        const alloc: PaymentAllocationEntity = {
          id: uuidv4(),
          tenantId: input.tenantId,
          paymentId: id,
          invoiceId: a.invoiceId,
          allocatedAmountCents: a.allocatedAmountCents,
          createdAt: now,
        };
        this.allocations.set(alloc.id, alloc);
        allocations.push(alloc);
      }
    }

    const payment: PaymentEntity = {
      id,
      tenantId: input.tenantId,
      counterpartyId: input.counterpartyId,
      bankAccountId: input.bankAccountId,
      paymentAccountId: input.paymentAccountId,
      paymentType: input.paymentType,
      paymentDate: input.paymentDate,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      status: 'CLEARED',
      createdAt: now,
      allocations,
    };

    this.payments.set(id, { ...payment });
    return { ...payment };
  }

  async findPaymentById(tenantId: string, id: string): Promise<PaymentEntity | null> {
    const p = this.payments.get(id);
    if (!p || p.tenantId !== tenantId) {
      return null;
    }
    const allocs = Array.from(this.allocations.values()).filter((a) => a.paymentId === id);
    return { ...p, allocations: allocs.map((a) => ({ ...a })) };
  }

  async listPayments(tenantId: string, counterpartyId?: string): Promise<PaymentEntity[]> {
    return Array.from(this.payments.values())
      .filter(
        (p) => p.tenantId === tenantId && (!counterpartyId || p.counterpartyId === counterpartyId),
      )
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map((p) => ({ ...p }));
  }

  async linkPaymentJournalEntry(
    tenantId: string,
    paymentId: string,
    journalEntryId: string,
  ): Promise<PaymentEntity> {
    const item = await this.findPaymentById(tenantId, paymentId);
    if (!item) {
      throw new NotFoundError('Payment', paymentId);
    }
    const updated: PaymentEntity = {
      ...item,
      journalEntryId,
    };
    this.payments.set(paymentId, { ...updated });
    return { ...updated };
  }

  async createAllocation(
    tenantId: string,
    paymentId: string,
    invoiceId: string,
    allocatedAmountCents: bigint,
  ): Promise<PaymentAllocationEntity> {
    const alloc: PaymentAllocationEntity = {
      id: uuidv4(),
      tenantId,
      paymentId,
      invoiceId,
      allocatedAmountCents,
      createdAt: new Date(),
    };
    this.allocations.set(alloc.id, alloc);
    return { ...alloc };
  }

  async listAllocationsForInvoice(
    tenantId: string,
    invoiceId: string,
  ): Promise<PaymentAllocationEntity[]> {
    return Array.from(this.allocations.values())
      .filter((a) => a.tenantId === tenantId && a.invoiceId === invoiceId)
      .map((a) => ({ ...a }));
  }
}
