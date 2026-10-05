import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type {
  InventoryAlertEntity,
  InventoryAlertStatus,
  InventoryAlertType,
} from '../domain/inventory-alert.entity';
import type {
  CreateAlertInput,
  CreateProductInput,
  CreateStockBatchInput,
  CreateStockMovementInput,
  IInventoryRepository,
  UpdateProductInput,
} from '../domain/inventory.repository.interface';
import type { ProductEntity, UnitOfMeasure, ValuationMethod } from '../domain/product.entity';
import type { StockBatchEntity } from '../domain/stock-batch.entity';
import type { StockMovementEntity, StockMovementType } from '../domain/stock-movement.entity';
import type { InventoryAlert, Product, StockBatch, StockMovement } from '@prisma/client';

@Injectable()
export class PrismaInventoryRepository implements IInventoryRepository {
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

  // --- Mappers ---
  private toProductEntity(model: Product): ProductEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      sku: model.sku,
      name: model.name,
      description: model.description ?? undefined,
      unitOfMeasure: model.unitOfMeasure as UnitOfMeasure,
      valuationMethod: model.valuationMethod as ValuationMethod,
      inventoryAccountId: model.inventoryAccountId,
      cogsAccountId: model.cogsAccountId,
      salesAccountId: model.salesAccountId,
      lowStockThreshold: model.lowStockThreshold,
      reorderQuantity: model.reorderQuantity,
      isActive: model.isActive,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toStockBatchEntity(model: StockBatch): StockBatchEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      productId: model.productId,
      batchReference: model.batchReference,
      receivedDate: model.receivedDate.toISOString().slice(0, 10),
      originalQuantity: model.originalQuantity,
      remainingQuantity: model.remainingQuantity,
      unitCostCents: model.unitCostCents,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }

  private toStockMovementEntity(model: StockMovement): StockMovementEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      productId: model.productId,
      stockBatchId: model.stockBatchId ?? undefined,
      journalEntryId: model.journalEntryId ?? undefined,
      movementType: model.movementType as StockMovementType,
      quantity: model.quantity,
      unitCostCents: model.unitCostCents,
      totalCostCents: model.totalCostCents,
      referenceNumber: model.referenceNumber ?? undefined,
      notes: model.notes ?? undefined,
      createdAt: model.createdAt,
    };
  }

  private toAlertEntity(model: InventoryAlert): InventoryAlertEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      productId: model.productId,
      alertType: model.alertType as InventoryAlertType,
      currentQuantity: model.currentQuantity,
      thresholdQuantity: model.thresholdQuantity,
      status: model.status as InventoryAlertStatus,
      createdAt: model.createdAt,
      resolvedAt: model.resolvedAt ?? undefined,
    };
  }

  // --- Products ---
  async createProduct(input: CreateProductInput): Promise<ProductEntity> {
    await this.ensureTenantExists(input.tenantId);

    const normalizedSku = input.sku.trim().toUpperCase();
    const existing = await this.findProductBySku(input.tenantId, normalizedSku);
    if (existing) {
      throw new ConflictError(`Product with SKU '${input.sku}' already exists`);
    }

    try {
      const record = await this.prisma.product.create({
        data: {
          tenantId: input.tenantId,
          sku: normalizedSku,
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
        },
      });
      return this.toProductEntity(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(`Product with SKU '${input.sku}' already exists`);
      }
      throw error;
    }
  }

  async findProductById(tenantId: string, id: string): Promise<ProductEntity | null> {
    const record = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    return record ? this.toProductEntity(record) : null;
  }

  async findProductBySku(tenantId: string, sku: string): Promise<ProductEntity | null> {
    const normalizedSku = sku.trim().toUpperCase();
    const record = await this.prisma.product.findFirst({
      where: { tenantId, sku: normalizedSku },
    });
    return record ? this.toProductEntity(record) : null;
  }

  async listProducts(tenantId: string, activeOnly = false): Promise<ProductEntity[]> {
    const records = await this.prisma.product.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { sku: 'asc' },
    });
    return records.map((r) => this.toProductEntity(r));
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

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.unitOfMeasure !== undefined ? { unitOfMeasure: input.unitOfMeasure } : {}),
        ...(input.lowStockThreshold !== undefined
          ? { lowStockThreshold: input.lowStockThreshold }
          : {}),
        ...(input.reorderQuantity !== undefined ? { reorderQuantity: input.reorderQuantity } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        version: { increment: 1 },
      },
    });

    return this.toProductEntity(updated);
  }

  // --- Stock Batches ---
  async createStockBatch(input: CreateStockBatchInput): Promise<StockBatchEntity> {
    await this.ensureTenantExists(input.tenantId);

    const record = await this.prisma.stockBatch.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        batchReference: input.batchReference.trim(),
        receivedDate: new Date(`${input.receivedDate}T00:00:00.000Z`),
        originalQuantity: input.originalQuantity,
        remainingQuantity: input.remainingQuantity,
        unitCostCents: input.unitCostCents,
      },
    });

    return this.toStockBatchEntity(record);
  }

  async findStockBatchById(tenantId: string, id: string): Promise<StockBatchEntity | null> {
    const record = await this.prisma.stockBatch.findFirst({
      where: { id, tenantId },
    });
    return record ? this.toStockBatchEntity(record) : null;
  }

  async listAvailableBatchesForProduct(
    tenantId: string,
    productId: string,
  ): Promise<StockBatchEntity[]> {
    const records = await this.prisma.stockBatch.findMany({
      where: {
        tenantId,
        productId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
    });

    return records.map((r) => this.toStockBatchEntity(r));
  }

  async listBatchesForProduct(tenantId: string, productId: string): Promise<StockBatchEntity[]> {
    const records = await this.prisma.stockBatch.findMany({
      where: {
        tenantId,
        productId,
      },
      orderBy: { receivedDate: 'desc' },
    });

    return records.map((r) => this.toStockBatchEntity(r));
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

    const updated = await this.prisma.stockBatch.update({
      where: { id },
      data: { remainingQuantity },
    });

    return this.toStockBatchEntity(updated);
  }

  // --- Stock Movements ---
  async createStockMovement(input: CreateStockMovementInput): Promise<StockMovementEntity> {
    await this.ensureTenantExists(input.tenantId);

    const record = await this.prisma.stockMovement.create({
      data: {
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
      },
    });

    return this.toStockMovementEntity(record);
  }

  async listStockMovements(tenantId: string, productId?: string): Promise<StockMovementEntity[]> {
    const records = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...(productId ? { productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toStockMovementEntity(r));
  }

  // --- Inventory Alerts ---
  async createAlert(input: CreateAlertInput): Promise<InventoryAlertEntity> {
    await this.ensureTenantExists(input.tenantId);

    const record = await this.prisma.inventoryAlert.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        alertType: input.alertType,
        currentQuantity: input.currentQuantity,
        thresholdQuantity: input.thresholdQuantity,
        status: 'OPEN',
      },
    });

    return this.toAlertEntity(record);
  }

  async findOpenAlert(tenantId: string, productId: string): Promise<InventoryAlertEntity | null> {
    const record = await this.prisma.inventoryAlert.findFirst({
      where: {
        tenantId,
        productId,
        status: 'OPEN',
      },
    });

    return record ? this.toAlertEntity(record) : null;
  }

  async updateAlertStatus(
    tenantId: string,
    alertId: string,
    status: InventoryAlertStatus,
  ): Promise<InventoryAlertEntity> {
    const alert = await this.prisma.inventoryAlert.findFirst({
      where: { id: alertId, tenantId },
    });
    if (!alert) {
      throw new NotFoundError('InventoryAlert', alertId);
    }

    const updated = await this.prisma.inventoryAlert.update({
      where: { id: alertId },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' ? new Date() : alert.resolvedAt,
      },
    });

    return this.toAlertEntity(updated);
  }

  async listAlerts(
    tenantId: string,
    status?: InventoryAlertStatus,
  ): Promise<InventoryAlertEntity[]> {
    const records = await this.prisma.inventoryAlert.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toAlertEntity(r));
  }
}
