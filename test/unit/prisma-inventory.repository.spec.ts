import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { ConflictError, NotFoundError } from '@/core/errors/app-error';
import { PrismaService } from '@/core/prisma/prisma.service';
import { PrismaInventoryRepository } from '@/modules/inventory/repositories/prisma-inventory.repository';

describe('PrismaInventoryRepository (Live PostgreSQL Integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaInventoryRepository;

  const tenantId = `tenant-inv-test-${Date.now()}`;
  let inventoryAccountId: string;
  let cogsAccountId: string;
  let salesAccountId: string;

  let isDbConnected = false;

  beforeAll(async () => {
    try {
      prisma = new PrismaService();
      await prisma.onModuleInit();
      repository = new PrismaInventoryRepository(prisma);

      // Setup tenant and necessary accounts
      await prisma.tenant.create({
        data: {
          id: tenantId,
          slug: tenantId,
          legalName: `Test Org ${tenantId}`,
        },
      });

      const invAcc = await prisma.chartOfAccount.create({
        data: {
          tenantId,
          accountCode: '1300',
          name: 'Inventory Asset',
          classification: 'ASSET',
        },
      });
      inventoryAccountId = invAcc.id;

      const cogsAcc = await prisma.chartOfAccount.create({
        data: {
          tenantId,
          accountCode: '5000',
          name: 'Cost of Goods Sold',
          classification: 'EXPENSE',
        },
      });
      cogsAccountId = cogsAcc.id;

      const salesAcc = await prisma.chartOfAccount.create({
        data: {
          tenantId,
          accountCode: '4000',
          name: 'Sales Revenue',
          classification: 'REVENUE',
        },
      });
      salesAccountId = salesAcc.id;
      isDbConnected = true;
    } catch {
      isDbConnected = false;
    }
  });

  beforeEach((ctx: { skip: () => void }) => {
    if (!isDbConnected) {
      ctx.skip();
    }
  });

  afterAll(async () => {
    if (!isDbConnected) {
      return;
    }
    try {
      await prisma.inventoryAlert.deleteMany({ where: { tenantId } });
      await prisma.stockMovement.deleteMany({ where: { tenantId } });
      await prisma.stockBatch.deleteMany({ where: { tenantId } });
      await prisma.product.deleteMany({ where: { tenantId } });
      await prisma.chartOfAccount.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    } finally {
      await prisma.onModuleDestroy();
    }
  });

  describe('Product Operations', () => {
    it('creates product and normalizes SKU to uppercase', async () => {
      if (!isDbConnected) {
        return;
      }
      const product = await repository.createProduct({
        tenantId,
        sku: 'item-001',
        name: 'Test Widget 1',
        description: 'Standard test item',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
        inventoryAccountId,
        cogsAccountId,
        salesAccountId,
        lowStockThreshold: 10,
        reorderQuantity: 50,
      });

      expect(product.id).toBeDefined();
      expect(product.sku).toBe('ITEM-001');
      expect(product.name).toBe('Test Widget 1');
      expect(product.isActive).toBe(true);

      const found = await repository.findProductById(tenantId, product.id);
      expect(found).not.toBeNull();
      expect(found?.sku).toBe('ITEM-001');
    });

    it('rejects duplicate SKU within same tenant', async () => {
      if (!isDbConnected) {
        return;
      }
      await expect(
        repository.createProduct({
          tenantId,
          sku: 'ITEM-001',
          name: 'Duplicate Widget',
          unitOfMeasure: 'UNIT',
          valuationMethod: 'FIFO',
          inventoryAccountId,
          cogsAccountId,
          salesAccountId,
          lowStockThreshold: 5,
          reorderQuantity: 20,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('updates product fields and increments version', async () => {
      if (!isDbConnected) {
        return;
      }
      const product = await repository.findProductBySku(tenantId, 'ITEM-001');
      expect(product).not.toBeNull();
      if (!product) {
        throw new Error('Product not found');
      }

      const updated = await repository.updateProduct(tenantId, product.id, {
        name: 'Updated Widget Name',
        lowStockThreshold: 15,
      });

      expect(updated.name).toBe('Updated Widget Name');
      expect(updated.lowStockThreshold).toBe(15);
      expect(updated.version).toBe(2);

      await expect(
        repository.updateProduct(tenantId, 'non-existent-id', { name: 'None' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('lists products and respects activeOnly filter', async () => {
      if (!isDbConnected) {
        return;
      }
      await repository.createProduct({
        tenantId,
        sku: 'INACTIVE-002',
        name: 'Inactive Item',
        unitOfMeasure: 'BOX',
        valuationMethod: 'FIFO',
        inventoryAccountId,
        cogsAccountId,
        salesAccountId,
        lowStockThreshold: 0,
        reorderQuantity: 0,
      });

      const inactive = await repository.findProductBySku(tenantId, 'INACTIVE-002');
      if (!inactive) {
        throw new Error('Inactive product not found');
      }
      await repository.updateProduct(tenantId, inactive.id, { isActive: false });

      const all = await repository.listProducts(tenantId, false);
      const activeOnly = await repository.listProducts(tenantId, true);

      expect(all.length).toBe(2);
      expect(activeOnly.length).toBe(1);
      expect(activeOnly[0]?.sku).toBe('ITEM-001');
    });
  });

  describe('Stock Batch Operations', () => {
    let productId: string;

    beforeAll(async () => {
      if (!isDbConnected) {
        return;
      }
      const product = await repository.findProductBySku(tenantId, 'ITEM-001');
      if (!product) {
        throw new Error('Product not found');
      }
      productId = product.id;
    });

    it('creates stock batches and lists available ones in FIFO order', async () => {
      if (!isDbConnected) {
        return;
      }
      const b2 = await repository.createStockBatch({
        tenantId,
        productId,
        batchReference: 'BATCH-2026-02',
        receivedDate: '2026-02-01',
        originalQuantity: 50,
        remainingQuantity: 50,
        unitCostCents: 1200n,
      });

      const b1 = await repository.createStockBatch({
        tenantId,
        productId,
        batchReference: 'BATCH-2026-01',
        receivedDate: '2026-01-15',
        originalQuantity: 100,
        remainingQuantity: 100,
        unitCostCents: 1000n,
      });

      const available = await repository.listAvailableBatchesForProduct(tenantId, productId);
      expect(available.length).toBe(2);
      // Older receivedDate first for FIFO
      expect(available[0]?.batchReference).toBe('BATCH-2026-01');
      expect(available[1]?.batchReference).toBe('BATCH-2026-02');

      // Update remaining quantity to 0 and verify exclusion from available
      await repository.updateBatchRemainingQuantity(tenantId, b1.id, 0);
      const availableAfter = await repository.listAvailableBatchesForProduct(tenantId, productId);
      expect(availableAfter.length).toBe(1);
      expect(availableAfter[0]?.id).toBe(b2.id);

      // But listBatchesForProduct returns all batches
      const allBatches = await repository.listBatchesForProduct(tenantId, productId);
      expect(allBatches.length).toBe(2);
    });
  });

  describe('Stock Movements', () => {
    it('creates movement and lists by product', async () => {
      if (!isDbConnected) {
        return;
      }
      const product = await repository.findProductBySku(tenantId, 'ITEM-001');
      if (!product) {
        throw new Error('Product not found');
      }
      const movement = await repository.createStockMovement({
        tenantId,
        productId: product.id,
        movementType: 'INFLOW_PURCHASE',
        quantity: 100,
        unitCostCents: 1000n,
        totalCostCents: 100000n,
        referenceNumber: 'PO-9001',
        notes: 'Initial stock intake',
      });

      expect(movement.id).toBeDefined();
      expect(movement.quantity).toBe(100);

      const movements = await repository.listStockMovements(tenantId, product.id);
      expect(movements.length).toBeGreaterThanOrEqual(1);
      expect(movements[0]?.referenceNumber).toBe('PO-9001');
    });
  });

  describe('Inventory Alerts', () => {
    it('creates, finds open alert, updates status and lists alerts', async () => {
      if (!isDbConnected) {
        return;
      }
      const product = await repository.findProductBySku(tenantId, 'ITEM-001');
      if (!product) {
        throw new Error('Product not found');
      }
      const alert = await repository.createAlert({
        tenantId,
        productId: product.id,
        alertType: 'LOW_STOCK',
        currentQuantity: 3,
        thresholdQuantity: 10,
      });

      expect(alert.id).toBeDefined();
      expect(alert.status).toBe('OPEN');

      const openAlert = await repository.findOpenAlert(tenantId, product.id);
      expect(openAlert).not.toBeNull();
      expect(openAlert?.id).toBe(alert.id);

      const resolved = await repository.updateAlertStatus(tenantId, alert.id, 'RESOLVED');
      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.resolvedAt).toBeDefined();

      const openAfter = await repository.findOpenAlert(tenantId, product.id);
      expect(openAfter).toBeNull();

      const allAlerts = await repository.listAlerts(tenantId);
      expect(allAlerts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
