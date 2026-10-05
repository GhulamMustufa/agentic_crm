import type {
  InventoryAlertEntity,
  InventoryAlertStatus,
  InventoryAlertType,
} from './inventory-alert.entity';
import type { ProductEntity, UnitOfMeasure, ValuationMethod } from './product.entity';
import type { StockBatchEntity } from './stock-batch.entity';
import type { StockMovementEntity, StockMovementType } from './stock-movement.entity';

export const INVENTORY_REPOSITORY_TOKEN = Symbol('IInventoryRepository');

export interface CreateProductInput {
  tenantId: string;
  sku: string;
  name: string;
  description?: string;
  unitOfMeasure: UnitOfMeasure;
  valuationMethod: ValuationMethod;
  inventoryAccountId: string;
  cogsAccountId: string;
  salesAccountId: string;
  lowStockThreshold: number;
  reorderQuantity: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  unitOfMeasure?: UnitOfMeasure;
  lowStockThreshold?: number;
  reorderQuantity?: number;
  isActive?: boolean;
}

export interface CreateStockBatchInput {
  tenantId: string;
  productId: string;
  batchReference: string;
  receivedDate: string;
  originalQuantity: number;
  remainingQuantity: number;
  unitCostCents: bigint;
}

export interface CreateStockMovementInput {
  tenantId: string;
  productId: string;
  stockBatchId?: string;
  journalEntryId?: string;
  movementType: StockMovementType;
  quantity: number;
  unitCostCents: bigint;
  totalCostCents: bigint;
  referenceNumber?: string;
  notes?: string;
}

export interface CreateAlertInput {
  tenantId: string;
  productId: string;
  alertType: InventoryAlertType;
  currentQuantity: number;
  thresholdQuantity: number;
}

export interface IInventoryRepository {
  // Products
  createProduct(input: CreateProductInput): Promise<ProductEntity>;
  findProductById(tenantId: string, id: string): Promise<ProductEntity | null>;
  findProductBySku(tenantId: string, sku: string): Promise<ProductEntity | null>;
  listProducts(tenantId: string, activeOnly?: boolean): Promise<ProductEntity[]>;
  updateProduct(tenantId: string, id: string, input: UpdateProductInput): Promise<ProductEntity>;

  // Stock Batches
  createStockBatch(input: CreateStockBatchInput): Promise<StockBatchEntity>;
  findStockBatchById(tenantId: string, id: string): Promise<StockBatchEntity | null>;
  listAvailableBatchesForProduct(tenantId: string, productId: string): Promise<StockBatchEntity[]>;
  listBatchesForProduct(tenantId: string, productId: string): Promise<StockBatchEntity[]>;
  updateBatchRemainingQuantity(
    tenantId: string,
    id: string,
    remainingQuantity: number,
  ): Promise<StockBatchEntity>;

  // Stock Movements
  createStockMovement(input: CreateStockMovementInput): Promise<StockMovementEntity>;
  listStockMovements(tenantId: string, productId?: string): Promise<StockMovementEntity[]>;

  // Alerts
  createAlert(input: CreateAlertInput): Promise<InventoryAlertEntity>;
  findOpenAlert(tenantId: string, productId: string): Promise<InventoryAlertEntity | null>;
  updateAlertStatus(
    tenantId: string,
    alertId: string,
    status: InventoryAlertStatus,
  ): Promise<InventoryAlertEntity>;
  listAlerts(tenantId: string, status?: InventoryAlertStatus): Promise<InventoryAlertEntity[]>;
}
