export type InventoryAlertType = 'LOW_STOCK' | 'OUT_OF_STOCK';
export type InventoryAlertStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface InventoryAlertEntity {
  id: string;
  tenantId: string;
  productId: string;
  alertType: InventoryAlertType;
  currentQuantity: number;
  thresholdQuantity: number;
  status: InventoryAlertStatus;
  createdAt: Date;
  resolvedAt?: Date;
}
