import { Inject, Injectable } from '@nestjs/common';

import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '../../../core/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import {
  INVENTORY_REPOSITORY_TOKEN,
  type IInventoryRepository,
} from '../domain/inventory.repository.interface';
import {
  createProductSchema,
  updateProductSchema,
  recordPurchaseBatchSchema,
  recordSaleSchema,
  recordAdjustmentSchema,
  type CreateProductInputDto,
  type UpdateProductInputDto,
  type RecordPurchaseBatchInputDto,
  type RecordSaleInputDto,
  type RecordAdjustmentInputDto,
} from '../dto/inventory.dto';

import type { InventoryAlertEntity, InventoryAlertStatus } from '../domain/inventory-alert.entity';
import type { ProductEntity } from '../domain/product.entity';
import type { StockBatchEntity } from '../domain/stock-batch.entity';
import type { StockMovementEntity } from '../domain/stock-movement.entity';

export interface ProductValuation {
  productId: string;
  sku: string;
  name: string;
  totalQuantity: number;
  totalValuationCents: bigint;
  weightedAverageCostCents: bigint;
}

export interface InventoryValuationReport {
  tenantId: string;
  asOfDate: string;
  totalValuationCents: bigint;
  products: ProductValuation[];
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(INVENTORY_REPOSITORY_TOKEN)
    private readonly inventoryRepo: IInventoryRepository,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Products & SKUs
  // ---------------------------------------------------------------------------

  async createProduct(
    tenantId: string,
    userId: string,
    rawDto: CreateProductInputDto,
  ): Promise<ProductEntity> {
    const parseResult = createProductSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Product validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // Check SKU uniqueness
    const existing = await this.inventoryRepo.findProductBySku(tenantId, dto.sku);
    if (existing) {
      throw new ConflictError(`Product with SKU '${dto.sku.toUpperCase()}' already exists`);
    }

    // Default accounts from Chart of Accounts if not explicitly provided
    let inventoryAccountId = dto.inventoryAccountId;
    let cogsAccountId = dto.cogsAccountId;
    let salesAccountId = dto.salesAccountId;

    if (!inventoryAccountId) {
      const acc = await this.ledgerService.findAccountByCode(tenantId, '1500');
      if (!acc) {
        throw new NotFoundError('Account', 'Inventory Asset Account 1500 not found');
      }
      inventoryAccountId = acc.id;
    }
    if (!cogsAccountId) {
      const acc = await this.ledgerService.findAccountByCode(tenantId, '5010');
      if (!acc) {
        throw new NotFoundError('Account', 'COGS Account 5010 not found');
      }
      cogsAccountId = acc.id;
    }
    if (!salesAccountId) {
      const acc = await this.ledgerService.findAccountByCode(tenantId, '4010');
      if (!acc) {
        throw new NotFoundError('Account', 'Sales Revenue Account 4010 not found');
      }
      salesAccountId = acc.id;
    }

    const product = await this.inventoryRepo.createProduct({
      tenantId,
      sku: dto.sku,
      name: dto.name,
      description: dto.description,
      unitOfMeasure: dto.unitOfMeasure,
      valuationMethod: dto.valuationMethod,
      inventoryAccountId,
      cogsAccountId,
      salesAccountId,
      lowStockThreshold: dto.lowStockThreshold,
      reorderQuantity: dto.reorderQuantity,
    });

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'Product',
      entityId: product.id,
      action: 'INVENTORY_PRODUCT_CREATED',
      newState: { productId: product.id, sku: product.sku, name: product.name },
    });

    return product;
  }

  async updateProduct(
    tenantId: string,
    userId: string,
    productId: string,
    rawDto: UpdateProductInputDto,
  ): Promise<ProductEntity> {
    const parseResult = updateProductSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Product update validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const product = await this.inventoryRepo.findProductById(tenantId, productId);
    if (!product) {
      throw new NotFoundError('Product', productId);
    }

    const updated = await this.inventoryRepo.updateProduct(tenantId, productId, dto);

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'Product',
      entityId: productId,
      action: 'INVENTORY_PRODUCT_UPDATED',
      newState: { productId, updates: dto },
    });

    return updated;
  }

  async getProductById(tenantId: string, productId: string): Promise<ProductEntity> {
    const product = await this.inventoryRepo.findProductById(tenantId, productId);
    if (!product) {
      throw new NotFoundError('Product', productId);
    }
    return product;
  }

  async listProducts(tenantId: string, activeOnly = false): Promise<ProductEntity[]> {
    return this.inventoryRepo.listProducts(tenantId, activeOnly);
  }

  // ---------------------------------------------------------------------------
  // Stock Balances & Purchases
  // ---------------------------------------------------------------------------

  async getStockBalance(tenantId: string, productId: string): Promise<number> {
    const batches = await this.inventoryRepo.listAvailableBatchesForProduct(tenantId, productId);
    return batches.reduce((sum, b) => sum + b.remainingQuantity, 0);
  }

  async recordPurchaseBatch(
    tenantId: string,
    userId: string,
    rawDto: RecordPurchaseBatchInputDto,
  ): Promise<{ batch: StockBatchEntity; movement: StockMovementEntity; journalEntryId: string }> {
    const parseResult = recordPurchaseBatchSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Purchase batch validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const product = await this.inventoryRepo.findProductById(tenantId, dto.productId);
    if (!product) {
      throw new NotFoundError('Product', dto.productId);
    }

    const totalCostCents = BigInt(dto.quantity) * dto.unitCostCents;

    // 1. Create Stock Batch
    const batch = await this.inventoryRepo.createStockBatch({
      tenantId,
      productId: product.id,
      batchReference: dto.batchReference,
      receivedDate: dto.receivedDate,
      originalQuantity: dto.quantity,
      remainingQuantity: dto.quantity,
      unitCostCents: dto.unitCostCents,
    });

    // 2. Post Journal Entry to Ledger
    // Debit: 1500 Inventory Asset (totalCostCents)
    // Credit: 2010 Accounts Payable / Cash (totalCostCents)
    let offsetAccountId = dto.offsetAccountId;
    if (!offsetAccountId) {
      const apAccount = await this.ledgerService.findAccountByCode(tenantId, '2010');
      if (!apAccount) {
        throw new NotFoundError('Account', 'Accounts Payable 2010 not found');
      }
      offsetAccountId = apAccount.id;
    }

    const journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: dto.receivedDate,
      description: `Inventory Purchase Batch ${batch.batchReference} for SKU ${product.sku}`,
      sourceType: 'INVENTORY',
      sourceId: batch.id,
      lines: [
        {
          accountId: product.inventoryAccountId,
          debitCents: totalCostCents,
          creditCents: 0n,
          memo: `Received ${dto.quantity} units of ${product.sku} @ ${dto.unitCostCents} cents/unit`,
        },
        {
          accountId: offsetAccountId,
          debitCents: 0n,
          creditCents: totalCostCents,
          memo: `AP/Cash for Inventory Purchase Batch ${batch.batchReference}`,
        },
      ],
    });

    // 3. Create Stock Movement Audit Record
    const movement = await this.inventoryRepo.createStockMovement({
      tenantId,
      productId: product.id,
      stockBatchId: batch.id,
      journalEntryId: journalEntry.id,
      movementType: 'INFLOW_PURCHASE',
      quantity: dto.quantity,
      unitCostCents: dto.unitCostCents,
      totalCostCents,
      referenceNumber: batch.batchReference,
      notes: `Purchased ${dto.quantity} units of ${product.sku}`,
    });

    // 4. Resolve low stock alert if stock is now above threshold
    const currentTotalStock = await this.getStockBalance(tenantId, product.id);
    if (currentTotalStock > product.lowStockThreshold) {
      const openAlert = await this.inventoryRepo.findOpenAlert(tenantId, product.id);
      if (openAlert) {
        await this.inventoryRepo.updateAlertStatus(tenantId, openAlert.id, 'RESOLVED');
      }
    }

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'StockBatch',
      entityId: batch.id,
      action: 'INVENTORY_PURCHASE_RECORDED',
      newState: {
        productId: product.id,
        batchId: batch.id,
        quantity: dto.quantity,
        totalCostCents: totalCostCents.toString(),
        journalEntryId: journalEntry.id,
      },
    });

    return { batch, movement, journalEntryId: journalEntry.id };
  }

  // ---------------------------------------------------------------------------
  // Sales & Deterministic FIFO COGS Depletion
  // ---------------------------------------------------------------------------

  async recordSale(
    tenantId: string,
    userId: string,
    rawDto: RecordSaleInputDto,
  ): Promise<{
    movements: StockMovementEntity[];
    cogsCents: bigint;
    saleRevenueCents: bigint;
    saleJournalEntryId: string;
    cogsJournalEntryId: string;
  }> {
    const parseResult = recordSaleSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Sale validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const product = await this.inventoryRepo.findProductById(tenantId, dto.productId);
    if (!product) {
      throw new NotFoundError('Product', dto.productId);
    }

    // 1. Check Available Stock & Prevent Negative Inventory
    const availableBatches = await this.inventoryRepo.listAvailableBatchesForProduct(
      tenantId,
      product.id,
    );
    const totalAvailable = availableBatches.reduce((sum, b) => sum + b.remainingQuantity, 0);

    if (dto.quantity > totalAvailable) {
      throw new UnprocessableEntityError(
        `Insufficient stock for SKU '${product.sku}'. Requested: ${dto.quantity}, Available: ${totalAvailable}`,
      );
    }

    // 2. Deterministic FIFO Depletion
    let remainingToDeplete = dto.quantity;
    let totalCogsCents = 0n;
    const depletedBatchRecords: Array<{
      batchId: string;
      depletedQty: number;
      unitCostCents: bigint;
      totalBatchCostCents: bigint;
    }> = [];

    for (const batch of availableBatches) {
      if (remainingToDeplete <= 0) {
        break;
      }

      const depleteFromThisBatch = Math.min(batch.remainingQuantity, remainingToDeplete);
      const batchCogs = BigInt(depleteFromThisBatch) * batch.unitCostCents;

      totalCogsCents += batchCogs;
      remainingToDeplete -= depleteFromThisBatch;

      const newRemaining = batch.remainingQuantity - depleteFromThisBatch;
      await this.inventoryRepo.updateBatchRemainingQuantity(tenantId, batch.id, newRemaining);

      depletedBatchRecords.push({
        batchId: batch.id,
        depletedQty: depleteFromThisBatch,
        unitCostCents: batch.unitCostCents,
        totalBatchCostCents: batchCogs,
      });
    }

    const totalSaleRevenueCents = BigInt(dto.quantity) * dto.unitPriceCents;

    // 3. Post Sale Revenue Journal Entry
    // Debit: 1200 AR or 1010 Cash (totalSaleRevenueCents)
    // Credit: 4010 Sales Revenue (totalSaleRevenueCents)
    let arAccountId = dto.offsetAccountId;
    if (!arAccountId) {
      const arAccount = await this.ledgerService.findAccountByCode(tenantId, '1200');
      if (!arAccount) {
        throw new NotFoundError('Account', 'Accounts Receivable 1200 not found');
      }
      arAccountId = arAccount.id;
    }

    const saleJournalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: dto.saleDate,
      description: `Sale Revenue for ${dto.quantity} units of SKU ${product.sku}`,
      sourceType: 'INVENTORY',
      sourceId: product.id,
      lines: [
        {
          accountId: arAccountId,
          debitCents: totalSaleRevenueCents,
          creditCents: 0n,
          memo: `Sale of ${dto.quantity} units @ ${dto.unitPriceCents} cents/unit`,
        },
        {
          accountId: product.salesAccountId,
          debitCents: 0n,
          creditCents: totalSaleRevenueCents,
          memo: `Sales Revenue for ${product.sku}`,
        },
      ],
    });

    // 4. Post FIFO COGS Journal Entry
    // Debit: 5010 Cost of Goods Sold (totalCogsCents)
    // Credit: 1500 Inventory Asset (totalCogsCents)
    const cogsJournalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: dto.saleDate,
      description: `COGS Depletion for ${dto.quantity} units of SKU ${product.sku}`,
      sourceType: 'INVENTORY',
      sourceId: product.id,
      lines: [
        {
          accountId: product.cogsAccountId,
          debitCents: totalCogsCents,
          creditCents: 0n,
          memo: `FIFO COGS for ${dto.quantity} units of ${product.sku}`,
        },
        {
          accountId: product.inventoryAccountId,
          debitCents: 0n,
          creditCents: totalCogsCents,
          memo: `Inventory Asset reduction for ${product.sku}`,
        },
      ],
    });

    // 5. Create Movement records for each depleted batch
    const movements: StockMovementEntity[] = [];
    for (const record of depletedBatchRecords) {
      const movement = await this.inventoryRepo.createStockMovement({
        tenantId,
        productId: product.id,
        stockBatchId: record.batchId,
        journalEntryId: cogsJournalEntry.id,
        movementType: 'OUTFLOW_SALE',
        quantity: -record.depletedQty,
        unitCostCents: record.unitCostCents,
        totalCostCents: record.totalBatchCostCents,
        referenceNumber: dto.referenceNumber,
        notes: `Sold ${record.depletedQty} units from batch ${record.batchId}`,
      });
      movements.push(movement);
    }

    // 6. Check Low-Stock / Out-of-Stock Alerts
    const remainingStock = totalAvailable - dto.quantity;
    if (remainingStock <= product.lowStockThreshold) {
      const alertType = remainingStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK';
      const existingAlert = await this.inventoryRepo.findOpenAlert(tenantId, product.id);

      if (existingAlert) {
        if (existingAlert.alertType !== alertType) {
          await this.inventoryRepo.updateAlertStatus(tenantId, existingAlert.id, 'RESOLVED');
          await this.inventoryRepo.createAlert({
            tenantId,
            productId: product.id,
            alertType,
            currentQuantity: remainingStock,
            thresholdQuantity: product.lowStockThreshold,
          });
        }
      } else {
        await this.inventoryRepo.createAlert({
          tenantId,
          productId: product.id,
          alertType,
          currentQuantity: remainingStock,
          thresholdQuantity: product.lowStockThreshold,
        });
      }
    }

    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'Product',
      entityId: product.id,
      action: 'INVENTORY_SALE_RECORDED',
      newState: {
        productId: product.id,
        quantitySold: dto.quantity,
        cogsCents: totalCogsCents.toString(),
        saleRevenueCents: totalSaleRevenueCents.toString(),
        saleJournalEntryId: saleJournalEntry.id,
        cogsJournalEntryId: cogsJournalEntry.id,
      },
    });

    return {
      movements,
      cogsCents: totalCogsCents,
      saleRevenueCents: totalSaleRevenueCents,
      saleJournalEntryId: saleJournalEntry.id,
      cogsJournalEntryId: cogsJournalEntry.id,
    };
  }

  // ---------------------------------------------------------------------------
  // Stock Adjustments (Recount & Write-off)
  // ---------------------------------------------------------------------------

  async recordAdjustment(
    tenantId: string,
    userId: string,
    rawDto: RecordAdjustmentInputDto,
  ): Promise<{ movement: StockMovementEntity; journalEntryId: string }> {
    const parseResult = recordAdjustmentSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Adjustment validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const product = await this.inventoryRepo.findProductById(tenantId, dto.productId);
    if (!product) {
      throw new NotFoundError('Product', dto.productId);
    }

    const currentStock = await this.getStockBalance(tenantId, product.id);

    if (dto.quantityDelta < 0) {
      const unitsToRemove = Math.abs(dto.quantityDelta);
      if (unitsToRemove > currentStock) {
        throw new UnprocessableEntityError(
          `Cannot write off ${unitsToRemove} units of SKU '${product.sku}'. Available: ${currentStock}`,
        );
      }

      // FIFO depletion for write-off
      const availableBatches = await this.inventoryRepo.listAvailableBatchesForProduct(
        tenantId,
        product.id,
      );
      let remainingToRemove = unitsToRemove;
      let writeOffCostCents = 0n;

      for (const batch of availableBatches) {
        if (remainingToRemove <= 0) {
          break;
        }
        const removeCount = Math.min(batch.remainingQuantity, remainingToRemove);
        writeOffCostCents += BigInt(removeCount) * batch.unitCostCents;
        remainingToRemove -= removeCount;

        await this.inventoryRepo.updateBatchRemainingQuantity(
          tenantId,
          batch.id,
          batch.remainingQuantity - removeCount,
        );
      }

      // Debit 6010 General Expense (Inventory shrinkage), Credit 1500 Inventory Asset
      const expenseAcc = await this.ledgerService.findAccountByCode(tenantId, '6010');
      if (!expenseAcc) {
        throw new NotFoundError('Account', 'Expense Account 6010 not found');
      }

      const journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: dto.adjustmentDate,
        description: `Inventory Write-Off for SKU ${product.sku}: ${dto.reason}`,
        sourceType: 'INVENTORY',
        sourceId: product.id,
        lines: [
          {
            accountId: expenseAcc.id,
            debitCents: writeOffCostCents,
            creditCents: 0n,
            memo: `Inventory Write-off: ${dto.reason}`,
          },
          {
            accountId: product.inventoryAccountId,
            debitCents: 0n,
            creditCents: writeOffCostCents,
            memo: `Write-off asset reduction for ${product.sku}`,
          },
        ],
      });

      const movement = await this.inventoryRepo.createStockMovement({
        tenantId,
        productId: product.id,
        journalEntryId: journalEntry.id,
        movementType: dto.adjustmentType,
        quantity: dto.quantityDelta,
        unitCostCents: writeOffCostCents / BigInt(unitsToRemove),
        totalCostCents: writeOffCostCents,
        notes: dto.reason,
      });

      return { movement, journalEntryId: journalEntry.id };
    } else {
      // Positive adjustment / recount addition: create a batch at recent cost or 0
      const availableBatches = await this.inventoryRepo.listAvailableBatchesForProduct(
        tenantId,
        product.id,
      );
      const unitCost = availableBatches[0]?.unitCostCents ?? 0n;
      const totalCostCents = BigInt(dto.quantityDelta) * unitCost;

      const batch = await this.inventoryRepo.createStockBatch({
        tenantId,
        productId: product.id,
        batchReference: `ADJ-${Date.now().toString(36).toUpperCase()}`,
        receivedDate: dto.adjustmentDate,
        originalQuantity: dto.quantityDelta,
        remainingQuantity: dto.quantityDelta,
        unitCostCents: unitCost,
      });

      // Debit 1500 Inventory Asset, Credit 6010 Expense (Gain / Recovery)
      const expenseAcc = await this.ledgerService.findAccountByCode(tenantId, '6010');
      if (!expenseAcc) {
        throw new NotFoundError('Account', 'Expense Account 6010 not found');
      }

      let journalEntryId = '';
      if (totalCostCents > 0n) {
        const journalEntry = await this.ledgerService.postJournalEntry(tenantId, userId, {
          entryDate: dto.adjustmentDate,
          description: `Inventory Recount Addition for SKU ${product.sku}: ${dto.reason}`,
          sourceType: 'INVENTORY',
          sourceId: product.id,
          lines: [
            {
              accountId: product.inventoryAccountId,
              debitCents: totalCostCents,
              creditCents: 0n,
              memo: `Recount addition of ${dto.quantityDelta} units for ${product.sku}`,
            },
            {
              accountId: expenseAcc.id,
              debitCents: 0n,
              creditCents: totalCostCents,
              memo: `Inventory gain: ${dto.reason}`,
            },
          ],
        });
        journalEntryId = journalEntry.id;
      }

      const movement = await this.inventoryRepo.createStockMovement({
        tenantId,
        productId: product.id,
        stockBatchId: batch.id,
        journalEntryId: journalEntryId || undefined,
        movementType: dto.adjustmentType,
        quantity: dto.quantityDelta,
        unitCostCents: unitCost,
        totalCostCents,
        notes: dto.reason,
      });

      return { movement, journalEntryId };
    }
  }

  // ---------------------------------------------------------------------------
  // Valuation & Reports
  // ---------------------------------------------------------------------------

  async calculateValuation(tenantId: string, asOfDate?: string): Promise<InventoryValuationReport> {
    const products = await this.inventoryRepo.listProducts(tenantId, true);
    let totalValuationCents = 0n;
    const productValuations: ProductValuation[] = [];

    const computedDate = asOfDate ?? new Date().toISOString().split('T')[0] ?? '';

    for (const p of products) {
      const batches = await this.inventoryRepo.listAvailableBatchesForProduct(tenantId, p.id);
      let prodQty = 0;
      let prodValuation = 0n;

      for (const b of batches) {
        prodQty += b.remainingQuantity;
        prodValuation += BigInt(b.remainingQuantity) * b.unitCostCents;
      }

      const weightedAverageCostCents = prodQty > 0 ? prodValuation / BigInt(prodQty) : 0n;

      totalValuationCents += prodValuation;
      productValuations.push({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        totalQuantity: prodQty,
        totalValuationCents: prodValuation,
        weightedAverageCostCents,
      });
    }

    return {
      tenantId,
      asOfDate: computedDate,
      totalValuationCents,
      products: productValuations,
    };
  }

  // ---------------------------------------------------------------------------
  // Movements & Alerts
  // ---------------------------------------------------------------------------

  async listStockMovements(tenantId: string, productId?: string): Promise<StockMovementEntity[]> {
    return this.inventoryRepo.listStockMovements(tenantId, productId);
  }

  async listAlerts(
    tenantId: string,
    status?: InventoryAlertStatus,
  ): Promise<InventoryAlertEntity[]> {
    return this.inventoryRepo.listAlerts(tenantId, status);
  }

  async dismissAlert(
    tenantId: string,
    userId: string,
    alertId: string,
  ): Promise<InventoryAlertEntity> {
    const updated = await this.inventoryRepo.updateAlertStatus(tenantId, alertId, 'DISMISSED');
    await this.auditService.recordEvent({
      tenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'InventoryAlert',
      entityId: alertId,
      action: 'INVENTORY_ALERT_DISMISSED',
      newState: { alertId, status: 'DISMISSED' },
    });
    return updated;
  }
}
