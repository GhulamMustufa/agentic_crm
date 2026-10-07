import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type {
  InvoiceEntity,
  InvoiceLineEntity,
  InvoiceStatus,
  InvoiceType,
} from '../domain/invoice.entity';
import type {
  IInvoiceRepository,
  CreateInvoiceInput,
  CreatePaymentInput,
} from '../domain/invoice.repository.interface';
import type {
  PaymentAllocationEntity,
  PaymentEntity,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../domain/payment.entity';
import type {
  Invoice,
  InvoiceLine,
  Payment,
  PaymentAllocation,
  Counterparty,
} from '@prisma/client';

@Injectable()
export class PrismaInvoiceRepository implements IInvoiceRepository {
  private readonly knownTenants = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTenantExists(tenantId: string): Promise<void> {
    if (this.knownTenants.has(tenantId)) {
      return;
    }
    await this.prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        slug: tenantId,
        legalName: `Tenant ${tenantId}`,
      },
    });
    this.knownTenants.add(tenantId);
  }

  private toInvoiceLineEntity(line: InvoiceLine): InvoiceLineEntity {
    return {
      id: line.id,
      tenantId: line.tenantId,
      invoiceId: line.invoiceId,
      accountId: line.accountId,
      lineNumber: line.lineNumber,
      description: line.description,
      quantity: line.quantity,
      unitCostCents: line.unitCostCents,
      totalCents: line.totalCents,
      createdAt: line.createdAt,
    };
  }

  private toInvoiceEntity(
    invoice: Invoice & { lines?: InvoiceLine[]; counterparty?: Counterparty },
  ): InvoiceEntity {
    return {
      id: invoice.id,
      tenantId: invoice.tenantId,
      counterpartyId: invoice.counterpartyId,
      counterparty: invoice.counterparty
        ? {
            id: invoice.counterparty.id,
            legalName: invoice.counterparty.legalName,
            type: invoice.counterparty.type,
          }
        : undefined,
      sourceDocumentId: invoice.sourceDocumentId ?? undefined,
      journalEntryId: invoice.journalEntryId ?? undefined,
      invoiceType: invoice.invoiceType as InvoiceType,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate.toISOString().split('T')[0] ?? '',
      dueDate: invoice.dueDate.toISOString().split('T')[0] ?? '',
      currency: invoice.currency,
      subtotalCents: invoice.subtotalCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
      amountDueCents: invoice.amountDueCents,
      status: invoice.status as InvoiceStatus,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      version: invoice.version,
      lines: invoice.lines ? invoice.lines.map((l) => this.toInvoiceLineEntity(l)) : [],
    };
  }

  private toAllocationEntity(alloc: PaymentAllocation): PaymentAllocationEntity {
    return {
      id: alloc.id,
      tenantId: alloc.tenantId,
      paymentId: alloc.paymentId,
      invoiceId: alloc.invoiceId,
      allocatedAmountCents: alloc.allocatedAmountCents,
      createdAt: alloc.createdAt,
    };
  }

  private toPaymentEntity(payment: Payment & { allocations?: PaymentAllocation[] }): PaymentEntity {
    return {
      id: payment.id,
      tenantId: payment.tenantId,
      counterpartyId: payment.counterpartyId,
      bankAccountId: payment.bankAccountId ?? undefined,
      paymentAccountId: payment.paymentAccountId,
      journalEntryId: payment.journalEntryId ?? undefined,
      paymentType: payment.paymentType as PaymentType,
      paymentDate: payment.paymentDate.toISOString().split('T')[0] ?? '',
      amountCents: payment.amountCents,
      paymentMethod: payment.paymentMethod as PaymentMethod,
      referenceNumber: payment.referenceNumber ?? undefined,
      status: payment.status as PaymentStatus,
      createdAt: payment.createdAt,
      allocations: payment.allocations
        ? payment.allocations.map((a) => this.toAllocationEntity(a))
        : [],
    };
  }

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceEntity> {
    await this.ensureTenantExists(input.tenantId);

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

    try {
      const created = await this.prisma.invoice.create({
        data: {
          tenantId: input.tenantId,
          counterpartyId: input.counterpartyId,
          sourceDocumentId: input.sourceDocumentId,
          invoiceType: input.invoiceType,
          invoiceNumber: input.invoiceNumber.trim(),
          issueDate: new Date(input.issueDate),
          dueDate: new Date(input.dueDate),
          currency: input.currency.toUpperCase(),
          subtotalCents: input.subtotalCents,
          taxCents: input.taxCents,
          totalCents: input.totalCents,
          amountDueCents: input.amountDueCents,
          status: 'DRAFT',
          lines: {
            create: input.lines.map((l) => ({
              tenantId: input.tenantId,
              accountId: l.accountId,
              lineNumber: l.lineNumber,
              description: l.description,
              quantity: l.quantity,
              unitCostCents: l.unitCostCents,
              totalCents: l.totalCents,
            })),
          },
        },
        include: {
          lines: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      return this.toInvoiceEntity(created);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(
          `Invoice number '${input.invoiceNumber}' already exists for this counterparty`,
        );
      }
      throw err;
    }
  }

  async findInvoiceById(tenantId: string, id: string): Promise<InvoiceEntity | null> {
    const item = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
        counterparty: true,
      },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toInvoiceEntity(item);
  }

  async findInvoiceByNumber(
    tenantId: string,
    counterpartyId: string,
    invoiceType: InvoiceType,
    invoiceNumber: string,
  ): Promise<InvoiceEntity | null> {
    const item = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        counterpartyId,
        invoiceType,
        invoiceNumber: {
          equals: invoiceNumber.trim(),
          mode: 'insensitive',
        },
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
        counterparty: true,
      },
    });
    return item ? this.toInvoiceEntity(item) : null;
  }

  async listInvoices(
    tenantId: string,
    options?: { counterpartyId?: string; type?: InvoiceType; status?: InvoiceStatus },
  ): Promise<InvoiceEntity[]> {
    const items = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        ...(options?.counterpartyId ? { counterpartyId: options.counterpartyId } : {}),
        ...(options?.type ? { invoiceType: options.type } : {}),
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { issueDate: 'desc' },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
        counterparty: true,
      },
    });

    return items.map((inv) => this.toInvoiceEntity(inv));
  }

  async updateInvoiceStatus(
    tenantId: string,
    id: string,
    status: InvoiceStatus,
  ): Promise<InvoiceEntity> {
    const existing = await this.findInvoiceById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Invoice', id);
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status,
        version: { increment: 1 },
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    return this.toInvoiceEntity(updated);
  }

  async updateInvoiceAmountDue(
    tenantId: string,
    id: string,
    amountDueCents: bigint,
  ): Promise<InvoiceEntity> {
    const existing = await this.findInvoiceById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Invoice', id);
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        amountDueCents,
        version: { increment: 1 },
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    return this.toInvoiceEntity(updated);
  }

  async linkJournalEntry(
    tenantId: string,
    invoiceId: string,
    journalEntryId: string,
  ): Promise<InvoiceEntity> {
    const existing = await this.findInvoiceById(tenantId, invoiceId);
    if (!existing) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        journalEntryId,
        version: { increment: 1 },
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    return this.toInvoiceEntity(updated);
  }

  // Payments
  async createPayment(input: CreatePaymentInput): Promise<PaymentEntity> {
    await this.ensureTenantExists(input.tenantId);

    const created = await this.prisma.payment.create({
      data: {
        tenantId: input.tenantId,
        counterpartyId: input.counterpartyId,
        bankAccountId: input.bankAccountId,
        paymentAccountId: input.paymentAccountId,
        paymentType: input.paymentType,
        paymentDate: new Date(input.paymentDate),
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        status: 'CLEARED',
        allocations:
          input.allocations && input.allocations.length > 0
            ? {
                create: input.allocations.map((a) => ({
                  tenantId: input.tenantId,
                  invoiceId: a.invoiceId,
                  allocatedAmountCents: a.allocatedAmountCents,
                })),
              }
            : undefined,
      },
      include: {
        allocations: true,
      },
    });

    return this.toPaymentEntity(created);
  }

  async findPaymentById(tenantId: string, id: string): Promise<PaymentEntity | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        allocations: true,
      },
    });
    if (!payment || payment.tenantId !== tenantId) {
      return null;
    }
    return this.toPaymentEntity(payment);
  }

  async listPayments(tenantId: string, counterpartyId?: string): Promise<PaymentEntity[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        ...(counterpartyId ? { counterpartyId } : {}),
      },
      orderBy: { paymentDate: 'desc' },
      include: {
        allocations: true,
      },
    });

    return payments.map((p) => this.toPaymentEntity(p));
  }

  async linkPaymentJournalEntry(
    tenantId: string,
    paymentId: string,
    journalEntryId: string,
  ): Promise<PaymentEntity> {
    const existing = await this.findPaymentById(tenantId, paymentId);
    if (!existing) {
      throw new NotFoundError('Payment', paymentId);
    }

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        journalEntryId,
      },
      include: {
        allocations: true,
      },
    });

    return this.toPaymentEntity(updated);
  }

  async createAllocation(
    tenantId: string,
    paymentId: string,
    invoiceId: string,
    allocatedAmountCents: bigint,
  ): Promise<PaymentAllocationEntity> {
    await this.ensureTenantExists(tenantId);

    const alloc = await this.prisma.paymentAllocation.create({
      data: {
        tenantId,
        paymentId,
        invoiceId,
        allocatedAmountCents,
      },
    });

    return this.toAllocationEntity(alloc);
  }

  async listAllocationsForInvoice(
    tenantId: string,
    invoiceId: string,
  ): Promise<PaymentAllocationEntity[]> {
    const allocs = await this.prisma.paymentAllocation.findMany({
      where: {
        tenantId,
        invoiceId,
      },
    });

    return allocs.map((a) => this.toAllocationEntity(a));
  }
}
