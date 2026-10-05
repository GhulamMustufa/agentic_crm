export type StockMovementType =
  'INFLOW_PURCHASE' | 'OUTFLOW_SALE' | 'ADJUSTMENT_WRITE_OFF' | 'ADJUSTMENT_RECOUNT';

export interface StockMovementEntity {
  id: string;
  tenantId: string;
  productId: string;
  stockBatchId?: string;
  journalEntryId?: string;
  movementType: StockMovementType;
  quantity: number; // positive for inflow, negative for outflow
  unitCostCents: bigint;
  totalCostCents: bigint;
  referenceNumber?: string;
  notes?: string;
  createdAt: Date;
}
