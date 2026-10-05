import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().min(1).max(100).trim(),
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(1000).optional(),
  unitOfMeasure: z.enum(['UNIT', 'KG', 'LITER', 'BOX', 'PACK']).default('UNIT'),
  valuationMethod: z.enum(['FIFO', 'WAV']).default('FIFO'),
  inventoryAccountId: z.string().uuid().optional(),
  cogsAccountId: z.string().uuid().optional(),
  salesAccountId: z.string().uuid().optional(),
  lowStockThreshold: z.number().int().min(0).default(5),
  reorderQuantity: z.number().int().positive().default(20),
});

export type CreateProductInputDto = z.input<typeof createProductSchema>;
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(1000).optional(),
  unitOfMeasure: z.enum(['UNIT', 'KG', 'LITER', 'BOX', 'PACK']).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  reorderQuantity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateProductInputDto = z.input<typeof updateProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const recordPurchaseBatchSchema = z.object({
  productId: z.string().uuid(),
  batchReference: z.string().min(1).max(100).trim(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  quantity: z.number().int().positive(),
  unitCostCents: z
    .union([z.bigint(), z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v)),
  offsetAccountId: z.string().uuid().optional(), // AP 2010 or Cash 1010
});

export type RecordPurchaseBatchInputDto = z.input<typeof recordPurchaseBatchSchema>;
export type RecordPurchaseBatchDto = z.infer<typeof recordPurchaseBatchSchema>;

export const recordSaleSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPriceCents: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v)),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  offsetAccountId: z.string().uuid().optional(), // AR 1200 or Cash 1010
  referenceNumber: z.string().max(100).optional(),
});

export type RecordSaleInputDto = z.input<typeof recordSaleSchema>;
export type RecordSaleDto = z.infer<typeof recordSaleSchema>;

export const recordAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  adjustmentType: z.enum(['ADJUSTMENT_WRITE_OFF', 'ADJUSTMENT_RECOUNT']),
  quantityDelta: z
    .number()
    .int()
    .refine((q) => q !== 0, 'Quantity delta cannot be zero'),
  adjustmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  reason: z.string().min(3).max(500),
});

export type RecordAdjustmentInputDto = z.input<typeof recordAdjustmentSchema>;
export type RecordAdjustmentDto = z.infer<typeof recordAdjustmentSchema>;
