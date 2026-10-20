import { describe, it, expect } from 'vitest';

import { findInvoiceSubsetSum } from '../../src/modules/banking/utils/subset-sum';

import type { InvoiceEntity } from '../../src/modules/invoices/domain/invoice.entity';

describe('findInvoiceSubsetSum', () => {
  const createMockInvoice = (id: string, num: string, amountDueCents: bigint): InvoiceEntity => ({
    id,
    tenantId: 'tenant-1',
    counterpartyId: 'cp-1',
    invoiceType: 'INVOICE',
    invoiceNumber: num,
    status: 'POSTED',
    issueDate: '2026-10-01',
    dueDate: '2026-10-31',
    currency: 'USD',
    subtotalCents: amountDueCents,
    taxCents: 0n,
    totalCents: amountDueCents,
    amountDueCents,
    version: 1,
    lines: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('should find a 2-invoice combination that equals the target amount exactly', () => {
    const inv1 = createMockInvoice('inv-1', 'INV-001', 600000n); // $6,000.00
    const inv2 = createMockInvoice('inv-2', 'INV-002', 400000n); // $4,000.00
    const inv3 = createMockInvoice('inv-3', 'INV-003', 150000n); // $1,500.00

    const match = findInvoiceSubsetSum([inv1, inv2, inv3], 1000000n); // $10,000.00
    expect(match).not.toBeNull();
    expect(match).toHaveLength(2);
    expect(match?.map((i) => i.id).sort()).toEqual(['inv-1', 'inv-2']);
  });

  it('should find a 3-invoice combination that equals the target amount', () => {
    const inv1 = createMockInvoice('inv-1', 'INV-001', 150000n); // $1,500
    const inv2 = createMockInvoice('inv-2', 'INV-002', 250000n); // $2,500
    const inv3 = createMockInvoice('inv-3', 'INV-003', 100000n); // $1,000
    const inv4 = createMockInvoice('inv-4', 'INV-004', 990000n); // $9,900

    const match = findInvoiceSubsetSum([inv1, inv2, inv3, inv4], 500000n); // $5,000.00
    expect(match).not.toBeNull();
    expect(match).toHaveLength(3);
    const total = match?.reduce((sum, i) => sum + i.amountDueCents, 0n);
    expect(total).toBe(500000n);
  });

  it('should return null when no combination sums to the target amount', () => {
    const inv1 = createMockInvoice('inv-1', 'INV-001', 100000n);
    const inv2 = createMockInvoice('inv-2', 'INV-002', 200000n);
    const inv3 = createMockInvoice('inv-3', 'INV-003', 300000n);

    const match = findInvoiceSubsetSum([inv1, inv2, inv3], 999999n);
    expect(match).toBeNull();
  });

  it('should return null when candidates list has fewer than 2 invoices', () => {
    const inv1 = createMockInvoice('inv-1', 'INV-001', 500000n);
    const match = findInvoiceSubsetSum([inv1], 500000n);
    expect(match).toBeNull();
  });

  it('should return null when target amount is zero or negative', () => {
    const inv1 = createMockInvoice('inv-1', 'INV-001', 500000n);
    const inv2 = createMockInvoice('inv-2', 'INV-002', 200000n);
    expect(findInvoiceSubsetSum([inv1, inv2], 0n)).toBeNull();
    expect(findInvoiceSubsetSum([inv1, inv2], -500n)).toBeNull();
  });
});
