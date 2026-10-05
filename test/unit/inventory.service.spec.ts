import { describe, it, expect, beforeEach } from 'vitest';

import { ConflictError, UnprocessableEntityError } from '../../src/core/errors/app-error';
import { InMemoryAuditRepository } from '../../src/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { InMemoryInventoryRepository } from '../../src/modules/inventory/repositories/in-memory-inventory.repository';
import { InventoryService } from '../../src/modules/inventory/services/inventory.service';
import { InMemoryLedgerRepository } from '../../src/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';

describe('InventoryService (Deterministic FIFO COGS & Ledger Integration)', () => {
  let inventoryService: InventoryService;
  let ledgerService: LedgerService;
  let inventoryRepo: InMemoryInventoryRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditRepository;
  let auditService: AuditService;

  const tenantId = 'tenant-inv-001';
  const userId = 'user-inv-001';

  beforeEach(async () => {
    inventoryRepo = new InMemoryInventoryRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditRepository();
    auditService = new AuditService(auditRepo);

    ledgerService = new LedgerService(ledgerRepo, auditService);
    inventoryService = new InventoryService(inventoryRepo, ledgerService, auditService);

    // Seed COA & Fiscal Periods
    await ledgerService.seedStandardChartOfAccounts(tenantId);
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);
  });

  describe('Product & SKU Management', () => {
    it('creates product with unique SKU and links chart of accounts', async () => {
      const product = await inventoryService.createProduct(tenantId, userId, {
        sku: 'WIDGET-PRO-01',
        name: 'Enterprise Widget Pro',
        description: 'Heavy duty enterprise widget',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
        lowStockThreshold: 10,
        reorderQuantity: 50,
      });

      expect(product.id).toBeDefined();
      expect(product.sku).toBe('WIDGET-PRO-01');
      expect(product.isActive).toBe(true);
      expect(product.lowStockThreshold).toBe(10);
    });

    it('prevents creating duplicate product with existing SKU in same tenant', async () => {
      await inventoryService.createProduct(tenantId, userId, {
        sku: 'GADGET-01',
        name: 'Gadget',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
      });

      await expect(
        inventoryService.createProduct(tenantId, userId, {
          sku: 'gadget-01', // case insensitive uniqueness check
          name: 'Gadget Duplicate',
          unitOfMeasure: 'UNIT',
          valuationMethod: 'FIFO',
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('updates product metadata', async () => {
      const product = await inventoryService.createProduct(tenantId, userId, {
        sku: 'DEVICE-01',
        name: 'Device v1',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
      });

      const updated = await inventoryService.updateProduct(tenantId, userId, product.id, {
        name: 'Device v1.1 Revised',
        lowStockThreshold: 15,
      });

      expect(updated.name).toBe('Device v1.1 Revised');
      expect(updated.lowStockThreshold).toBe(15);
      expect(updated.version).toBe(2);
    });
  });

  describe('Purchases & Automated Ledger Entries', () => {
    it('records purchase batch and posts balanced journal entry to inventory asset', async () => {
      const product = await inventoryService.createProduct(tenantId, userId, {
        sku: 'PROD-PURCHASE-01',
        name: 'Raw Materials Box',
        unitOfMeasure: 'BOX',
        valuationMethod: 'FIFO',
      });

      // Buy 100 boxes @ $25.00/box = $2,500.00
      const { batch, movement, journalEntryId } = await inventoryService.recordPurchaseBatch(
        tenantId,
        userId,
        {
          productId: product.id,
          batchReference: 'PO-2026-001',
          receivedDate: '2026-01-10',
          quantity: 100,
          unitCostCents: 25_00n,
        },
      );

      expect(batch.remainingQuantity).toBe(100);
      expect(batch.unitCostCents).toBe(25_00n);
      expect(movement.movementType).toBe('INFLOW_PURCHASE');
      expect(movement.totalCostCents).toBe(2500_00n);

      // Verify stock balance
      const balance = await inventoryService.getStockBalance(tenantId, product.id);
      expect(balance).toBe(100);

      // Verify General Ledger Journal Entry
      const entry = await ledgerService.getEntryById(tenantId, journalEntryId);
      expect(entry).toBeDefined();
      if (!entry) {
        throw new Error('Entry not found');
      }

      expect(entry.sourceType).toBe('INVENTORY');
      expect(entry.totalDebitCents).toBe(2500_00n);
      expect(entry.totalCreditCents).toBe(2500_00n);

      // Line 1: Debit 1500 Inventory Asset
      const debitLine = entry.lines.find((l) => l.debitCents > 0n);
      expect(debitLine?.accountId).toBe(product.inventoryAccountId);
      expect(debitLine?.debitCents).toBe(2500_00n);

      // Line 2: Credit 2010 AP
      const creditLine = entry.lines.find((l) => l.creditCents > 0n);
      expect(creditLine?.creditCents).toBe(2500_00n);
    });
  });

  describe('Sales & Deterministic FIFO COGS Depletion', () => {
    it('depletes inventory strictly according to FIFO and calculates exact COGS across multiple batches', async () => {
      const product = await inventoryService.createProduct(tenantId, userId, {
        sku: 'COGS-TEST-01',
        name: 'FIFO Test Item',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
        lowStockThreshold: 10,
      });

      // Batch 1: Received Jan 5, 20 units @ $10.00 = $200.00
      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: product.id,
        batchReference: 'BATCH-001',
        receivedDate: '2026-01-05',
        quantity: 20,
        unitCostCents: 10_00n,
      });

      // Batch 2: Received Jan 10, 30 units @ $15.00 = $450.00
      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: product.id,
        batchReference: 'BATCH-002',
        receivedDate: '2026-01-10',
        quantity: 30,
        unitCostCents: 15_00n,
      });

      // Total Available: 50 units.
      expect(await inventoryService.getStockBalance(tenantId, product.id)).toBe(50);

      // Sell 35 units @ $30.00/unit on Jan 15
      // FIFO Depletion expectation:
      //  - 20 units from Batch 1 @ $10.00 = $200.00
      //  - 15 units from Batch 2 @ $15.00 = $225.00
      //  - Total Expected COGS = $425.00 (42,500 cents)
      //  - Remaining in Batch 1: 0
      //  - Remaining in Batch 2: 15
      //  - New Stock Balance: 15 units
      //  - Total Sale Revenue: 35 * $30.00 = $1,050.00 (105,000 cents)
      const saleResult = await inventoryService.recordSale(tenantId, userId, {
        productId: product.id,
        quantity: 35,
        unitPriceCents: 30_00n,
        saleDate: '2026-01-15',
        referenceNumber: 'SO-1001',
      });

      expect(saleResult.cogsCents).toBe(425_00n);
      expect(saleResult.saleRevenueCents).toBe(1050_00n);
      expect(saleResult.movements.length).toBe(2);

      // Verify Stock Balance after sale
      const remainingBalance = await inventoryService.getStockBalance(tenantId, product.id);
      expect(remainingBalance).toBe(15);

      // Verify COGS Journal Entry (Debit 5010 COGS, Credit 1500 Inventory Asset)
      const cogsEntry = await ledgerService.getEntryById(tenantId, saleResult.cogsJournalEntryId);
      expect(cogsEntry).toBeDefined();
      if (!cogsEntry) {
        throw new Error('COGS entry missing');
      }
      expect(cogsEntry.totalDebitCents).toBe(425_00n);
      expect(cogsEntry.totalCreditCents).toBe(425_00n);

      const cogsLine = cogsEntry.lines.find((l) => l.accountId === product.cogsAccountId);
      expect(cogsLine?.debitCents).toBe(425_00n);

      const assetLine = cogsEntry.lines.find((l) => l.accountId === product.inventoryAccountId);
      expect(assetLine?.creditCents).toBe(425_00n);

      // Verify Revenue Journal Entry (Debit 1200 AR, Credit 4010 Sales Revenue)
      const revEntry = await ledgerService.getEntryById(tenantId, saleResult.saleJournalEntryId);
      expect(revEntry).toBeDefined();
      if (!revEntry) {
        throw new Error('Rev entry missing');
      }
      expect(revEntry.totalDebitCents).toBe(1050_00n);
      expect(revEntry.totalCreditCents).toBe(1050_00n);
    });

    it('strictly prevents negative inventory when requested quantity exceeds available stock', async () => {
      const product = await inventoryService.createProduct(tenantId, userId, {
        sku: 'LIMITED-01',
        name: 'Limited Stock Item',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
      });

      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: product.id,
        batchReference: 'BATCH-LIMIT',
        receivedDate: '2026-01-05',
        quantity: 5,
        unitCostCents: 50_00n,
      });

      // Selling 10 units when only 5 are in stock must fail
      await expect(
        inventoryService.recordSale(tenantId, userId, {
          productId: product.id,
          quantity: 10,
          unitPriceCents: 100_00n,
          saleDate: '2026-01-10',
        }),
      ).rejects.toThrow(UnprocessableEntityError);

      // Verify stock was unaffected
      expect(await inventoryService.getStockBalance(tenantId, product.id)).toBe(5);
    });
  });

  describe('Stock Adjustments (Recount & Write-off)', () => {
    it('processes write-off adjustment with ledger debit to expense and credit to asset', async () => {
      const product = await inventoryService.createProduct(tenantId, userId, {
        sku: 'PERISHABLE-01',
        name: 'Fresh Dairy',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
      });

      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: product.id,
        batchReference: 'DAIRY-BATCH-1',
        receivedDate: '2026-02-01',
        quantity: 50,
        unitCostCents: 4_00n, // $4.00/unit
      });

      // Write-off 5 spoiled units
      const { movement, journalEntryId } = await inventoryService.recordAdjustment(
        tenantId,
        userId,
        {
          productId: product.id,
          adjustmentType: 'ADJUSTMENT_WRITE_OFF',
          quantityDelta: -5,
          adjustmentDate: '2026-02-05',
          reason: 'Spoilage during transport',
        },
      );

      expect(movement.movementType).toBe('ADJUSTMENT_WRITE_OFF');
      expect(movement.quantity).toBe(-5);
      expect(movement.totalCostCents).toBe(20_00n); // 5 * $4.00

      // Balance reduced
      expect(await inventoryService.getStockBalance(tenantId, product.id)).toBe(45);

      // Journal entry checks
      const entry = await ledgerService.getEntryById(tenantId, journalEntryId);
      expect(entry?.totalDebitCents).toBe(20_00n);
      expect(entry?.totalCreditCents).toBe(20_00n);
    });
  });

  describe('Low-Stock Alerts & Valuation Reports', () => {
    it('triggers LOW_STOCK and OUT_OF_STOCK alerts and resolves when replenished', async () => {
      const product = await inventoryService.createProduct(tenantId, userId, {
        sku: 'ALERT-ITEM-01',
        name: 'Critical Spare Part',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
        lowStockThreshold: 10,
      });

      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: product.id,
        batchReference: 'SPARE-001',
        receivedDate: '2026-02-01',
        quantity: 15,
        unitCostCents: 20_00n,
      });

      // No alerts initially (15 > 10)
      let alerts = await inventoryService.listAlerts(tenantId, 'OPEN');
      expect(alerts.length).toBe(0);

      // Sell 7 units -> remaining 8 (<= 10 threshold) -> Triggers LOW_STOCK
      await inventoryService.recordSale(tenantId, userId, {
        productId: product.id,
        quantity: 7,
        unitPriceCents: 50_00n,
        saleDate: '2026-02-02',
      });

      alerts = await inventoryService.listAlerts(tenantId, 'OPEN');
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.alertType).toBe('LOW_STOCK');
      expect(alerts[0]?.currentQuantity).toBe(8);

      // Sell remaining 8 units -> 0 remaining -> Triggers OUT_OF_STOCK
      await inventoryService.recordSale(tenantId, userId, {
        productId: product.id,
        quantity: 8,
        unitPriceCents: 50_00n,
        saleDate: '2026-02-03',
      });

      alerts = await inventoryService.listAlerts(tenantId, 'OPEN');
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.alertType).toBe('OUT_OF_STOCK');
      expect(alerts[0]?.currentQuantity).toBe(0);

      // Replenish stock with 50 units (> 10) -> Resolves open alert
      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: product.id,
        batchReference: 'SPARE-REPLENISH',
        receivedDate: '2026-02-04',
        quantity: 50,
        unitCostCents: 20_00n,
      });

      alerts = await inventoryService.listAlerts(tenantId, 'OPEN');
      expect(alerts.length).toBe(0);
    });

    it('calculates deterministic inventory valuation and weighted average unit cost', async () => {
      const p1 = await inventoryService.createProduct(tenantId, userId, {
        sku: 'VAL-01',
        name: 'Valuation Product A',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
      });

      const p2 = await inventoryService.createProduct(tenantId, userId, {
        sku: 'VAL-02',
        name: 'Valuation Product B',
        unitOfMeasure: 'UNIT',
        valuationMethod: 'FIFO',
      });

      // P1: 10 units @ $10.00 = $100.00, 20 units @ $20.00 = $400.00 -> Total 30 units, $500.00
      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: p1.id,
        batchReference: 'BATCH-A1',
        receivedDate: '2026-03-01',
        quantity: 10,
        unitCostCents: 10_00n,
      });
      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: p1.id,
        batchReference: 'BATCH-A2',
        receivedDate: '2026-03-05',
        quantity: 20,
        unitCostCents: 20_00n,
      });

      // P2: 50 units @ $5.00 = $250.00
      await inventoryService.recordPurchaseBatch(tenantId, userId, {
        productId: p2.id,
        batchReference: 'BATCH-B1',
        receivedDate: '2026-03-02',
        quantity: 50,
        unitCostCents: 5_00n,
      });

      const report = await inventoryService.calculateValuation(tenantId, '2026-03-10');
      // Total valuation: $500 + $250 = $750.00 (75,000 cents)
      expect(report.totalValuationCents).toBe(750_00n);

      const p1Val = report.products.find((p) => p.productId === p1.id);
      expect(p1Val?.totalQuantity).toBe(30);
      expect(p1Val?.totalValuationCents).toBe(500_00n);
      // Weighted average: 50000 / 30 = 1666 cents ($16.66)
      expect(p1Val?.weightedAverageCostCents).toBe(16_66n);

      const p2Val = report.products.find((p) => p.productId === p2.id);
      expect(p2Val?.totalQuantity).toBe(50);
      expect(p2Val?.totalValuationCents).toBe(250_00n);
      expect(p2Val?.weightedAverageCostCents).toBe(5_00n);

      // Verify audit integrity
      const auditChain = await auditService.verifyChain(tenantId);
      expect(auditChain.isValid).toBe(true);
      expect(auditChain.totalVerified).toBeGreaterThan(0);
    });
  });
});
