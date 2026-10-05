export interface StockBatchEntity {
  id: string;
  tenantId: string;
  productId: string;
  batchReference: string;
  receivedDate: string; // YYYY-MM-DD
  originalQuantity: number;
  remainingQuantity: number;
  unitCostCents: bigint;
  createdAt: Date;
  updatedAt: Date;
}
