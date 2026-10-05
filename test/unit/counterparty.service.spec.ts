import { describe, it, expect, beforeEach } from 'vitest';

import { ConflictError, NotFoundError } from '@/core/errors/app-error';
import { InMemoryAuditRepository } from '@/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '@/modules/audit/services/audit.service';
import { InMemoryCounterpartyRepository } from '@/modules/counterparties/repositories/in-memory-counterparty.repository';
import { CounterpartyService } from '@/modules/counterparties/services/counterparty.service';

describe('CounterpartyService - Vendors & Customers Directory', () => {
  let counterpartyService: CounterpartyService;
  let counterpartyRepo: InMemoryCounterpartyRepository;
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000099';

  beforeEach(() => {
    counterpartyRepo = new InMemoryCounterpartyRepository();
    const auditService = new AuditService(new InMemoryAuditRepository());
    counterpartyService = new CounterpartyService(counterpartyRepo, auditService);
  });

  it('1. should create customer and vendor entities with default payment terms', async () => {
    const customer = await counterpartyService.createCounterparty(tenantId, userId, {
      type: 'CUSTOMER',
      legalName: 'Acme Global Logistics LLC',
      taxIdentifier: 'US-987654321',
      paymentTermsDays: 45,
    });

    expect(customer.id).toBeDefined();
    expect(customer.legalName).toBe('Acme Global Logistics LLC');
    expect(customer.normalizedName).toBe('acme global logistics llc');
    expect(customer.paymentTermsDays).toBe(45);

    const vendor = await counterpartyService.createCounterparty(tenantId, userId, {
      type: 'VENDOR',
      legalName: 'Cloud Services Provider Inc.',
    });

    expect(vendor.paymentTermsDays).toBe(30); // Default 30 days
  });

  it('2. should reject duplicate counterparty name within the same tenant', async () => {
    await counterpartyService.createCounterparty(tenantId, userId, {
      type: 'VENDOR',
      legalName: 'Stripe, Inc.',
    });

    // Attempt to create variant with different casing and punctuation
    await expect(
      counterpartyService.createCounterparty(tenantId, userId, {
        type: 'VENDOR',
        legalName: 'stripe inc',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('3. should list counterparties filtered by type', async () => {
    await counterpartyService.createCounterparty(tenantId, userId, {
      type: 'CUSTOMER',
      legalName: 'Customer One',
    });
    await counterpartyService.createCounterparty(tenantId, userId, {
      type: 'VENDOR',
      legalName: 'Vendor One',
    });
    await counterpartyService.createCounterparty(tenantId, userId, {
      type: 'BOTH',
      legalName: 'Partner Corp',
    });

    const customers = await counterpartyService.listCounterparties(tenantId, 'CUSTOMER');
    expect(customers.length).toBe(2); // Customer One + Partner Corp

    const vendors = await counterpartyService.listCounterparties(tenantId, 'VENDOR');
    expect(vendors.length).toBe(2); // Vendor One + Partner Corp
  });

  it('4. should update counterparty legal name and regenerate normalized name', async () => {
    const created = await counterpartyService.createCounterparty(tenantId, userId, {
      type: 'VENDOR',
      legalName: 'Old Supplier Name LLC',
    });

    const updated = await counterpartyService.updateCounterparty(tenantId, userId, created.id, {
      legalName: 'New Supplier Name Inc.',
    });

    expect(updated.legalName).toBe('New Supplier Name Inc.');
    expect(updated.normalizedName).toBe('new supplier name inc');
  });

  it('5. should throw NotFoundError for non-existent counterparty', async () => {
    await expect(
      counterpartyService.findById(tenantId, '00000000-0000-0000-0000-000000009999'),
    ).rejects.toThrow(NotFoundError);
  });
});
