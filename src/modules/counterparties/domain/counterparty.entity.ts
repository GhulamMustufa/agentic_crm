export type CounterpartyType = 'VENDOR' | 'CUSTOMER' | 'BOTH';

export interface CounterpartyEntity {
  id: string;
  tenantId: string;
  type: CounterpartyType;
  legalName: string;
  normalizedName: string;
  taxIdentifier?: string;
  defaultAccountId?: string;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
