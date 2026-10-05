export type UnitOfMeasure = 'UNIT' | 'KG' | 'LITER' | 'BOX' | 'PACK';
export type ValuationMethod = 'FIFO' | 'WAV';

export interface ProductEntity {
  id: string;
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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
