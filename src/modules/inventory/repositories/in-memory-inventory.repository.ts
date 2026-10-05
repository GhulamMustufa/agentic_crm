import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';

import type { InventoryAlertEntity, InventoryAlertStatus } from '../domain/inventory-alert.entity';
import type {
  IInventoryRepository,
  CreateProductInput,
  UpdateProductInput,
  CreateStockBatchInput,
  CreateStockMovementInput,
  CreateAlertInput,
} from '../domain/inventory.repository.interface';
import type { ProductEntity } from '../domain/product.entity';
import type { StockBatchEntity } from '../domain/stock-batch.entity';
import type { StockMovementEntity } from '../domain/stock-movement.entity';

@Injectable()
export class InMemoryInventoryRepository implements IInventoryRepository {
  private readonly products = new Map<string, ProductEntity>();
  private readonly stockBatches = new Map<string, StockBatchEntity>();
  private readonly stockMovements = new Map<string, StockMovementEntity>();
  private readonly inventoryAlerts = new Map<string, InventoryAlertEntity>();

  // Products
  async createProduct(input: CreateProductInput): Promise<ProductEntity> {
    const existing = await this.findProductBySku(input.tenantId, input.sku);
    if (existing) {
      throw new ConflictError(`Product with SKU '${input.sku}' already exists`);
    }

    const now = new Date();
    const product: ProductEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      sku: input.sku.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim(),
      unitOfMeasure: input.unitOfMeasure,
      valuationMethod: input.valuationMethod,
      inventoryAccountId: input.inventoryAccountId,
      cogsAccountId: input.cogsAccountId,
      salesAccountId: input.salesAccountId,
      lowStockThreshold: input.lowStockThreshold,
      reorderQuantity: input.reorderQuantity,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.products.set(product.id, { ...product });
    return { ...product };
  }

  async findProductById(tenantId: string, id: string): Promise<ProductEntity | null> {
    const product = this.products.get(id);
    if (!product || product.tenantId !== tenantId) {
      return null;
    }
    return { ...product };
  }

  async findProductBySku(tenantId: string, sku: string): Promise<ProductEntity | null> {
    const normalizedSku = sku.trim().toUpperCase();
    for (const product of this.products.values()) {
      if (product.tenantId === tenantId && product.sku === normalizedSku) {
        return { ...product };
      }
    }
    return null;
  }

  async listProducts(tenantId: string, activeOnly = false): Promise<ProductEntity[]> {
    return Array.from(this.products.values())
      .filter((p) => p.tenantId === tenantId && (!activeOnly || p.isActive))
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((p) => ({ ...p }));
  }

  async updateProduct(
    tenantId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductEntity> {
    const product = await this.findProductById(tenantId, id);
    if (!product) {
      throw new NotFoundError('Product', id);
    }

    const updated: ProductEntity = {
      ...product,
      ...input,
      name: input.name !== undefined ? input.name.trim() : product.name,
      description: input.description !== undefined ? input.description.trim() : product.description,
      updatedAt: new Date(),
      version: product.version + 1,
    };

    this.products.set(id, { ...updated });
    return { ...updated };
  }

  // Stock Batches
  async createStockBatch(input: CreateStockBatchInput): Promise<StockBatchEntity> {
    const now = new Date();
    const batch: StockBatchEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      productId: input.productId,
      batchReference: input.batchReference.trim(),
      receivedDate: input.receivedDate,
      originalQuantity: input.originalQuantity,
      remainingQuantity: input.remainingQuantity,
      unitCostCents: input.unitCostCents,
      createdAt: now,
      updatedAt: now,
    };

    this.stockBatches.set(batch.id, { ...batch });
    return { ...batch };
  }

  async findStockBatchById(tenantId: string, id: string): Promise<StockBatchEntity | null> {
    const batch = this.stockBatches.get(id);
    if (!batch || batch.tenantId !== tenantId) {
      return null;
    }
    return { ...batch };
  }

  async listAvailableBatchesForProduct(
    tenantId: string,
    productId: string,
  ): Promise<StockBatchEntity[]> {
    return Array.from(this.stockBatches.values())
      .filter(
        (b) => b.tenantId === tenantId && b.productId === productId && b.remainingQuantity > 0,
      )
      .sort((a, b) => {
        const dateCompare = a.receivedDate.localeCompare(b.receivedDate);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((b) => ({ ...b }));
  }

  async listBatchesForProduct(tenantId: string, productId: string): Promise<StockBatchEntity[]> {
    return Array.from(this.stockBatches.values())
      .filter((b) => b.tenantId === tenantId && b.productId === productId)
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
      .map((b) => ({ ...b }));
  }

  async updateBatchRemainingQuantity(
    tenantId: string,
    id: string,
    remainingQuantity: number,
  ): Promise<StockBatchEntity> {
    const batch = await this.findStockBatchById(tenantId, id);
    if (!batch) {
      throw new NotFoundError('StockBatch', id);
    }

    const updated: StockBatchEntity = {
      ...batch,
      remainingQuantity,
      updatedAt: new Date(),
    };

    this.stockBatches.set(id, { ...updated });
    return { ...updated };
  }

  // Stock Movements
  async createStockMovement(input: CreateStockMovementInput): Promise<StockMovementEntity> {
    const movement: StockMovementEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      productId: input.productId,
      stockBatchId: input.stockBatchId,
      journalEntryId: input.journalEntryId,
      movementType: input.movementType,
      quantity: input.quantity,
      unitCostCents: input.unitCostCents,
      totalCostCents: input.totalCostCents,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      createdAt: new Date(),
    };

    this.stockMovements.set(movement.id, { ...movement });
    return { ...movement };
  }

  async listStockMovements(tenantId: string, productId?: string): Promise<StockMovementEntity[]> {
    return Array.from(this.stockMovements.values())
      .filter((m) => m.tenantId === tenantId && (!productId || m.productId === productId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((m) => ({ ...m }));
  }

  // Inventory Alerts
  async createAlert(input: CreateAlertInput): Promise<InventoryAlertEntity> {
    const alert: InventoryAlertEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      productId: input.productId,
      alertType: input.alertType,
      currentQuantity: input.currentQuantity,
      thresholdQuantity: input.thresholdQuantity,
      status: 'OPEN',
      createdAt: new Date(),
    };

    this.inventoryAlerts.set(alert.id, { ...alert });
    return { ...alert };
  }

  async findOpenAlert(tenantId: string, productId: string): Promise<InventoryAlertEntity | null> {
    for (const alert of this.inventoryAlerts.values()) {
      if (alert.tenantId === tenantId && alert.productId === productId && alert.status === 'OPEN') {
        return { ...alert };
      }
    }
    return null;
  }

  async updateAlertStatus(
    tenantId: string,
    alertId: string,
    status: InventoryAlertStatus,
  ): Promise<InventoryAlertEntity> {
    const alert = this.inventoryAlerts.get(alertId);
    if (!alert || alert.tenantId !== tenantId) {
      throw new NotFoundError('InventoryAlert', alertId);
    }

    const updated: InventoryAlertEntity = {
      ...alert,
      status,
      resolvedAt: status === 'RESOLVED' ? new Date() : alert.resolvedAt,
    };

    this.inventoryAlerts.set(alertId, { ...updated });
    return { ...updated };
  }

  async listAlerts(
    tenantId: string,
    status?: InventoryAlertStatus,
  ): Promise<InventoryAlertEntity[]> {
    return Array.from(this.inventoryAlerts.values())
      .filter((a) => a.tenantId === tenantId && (!status || a.status === status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((a) => ({ ...a }));
  }
}
