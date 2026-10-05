export type AccountingPeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED';

export interface FiscalYearEntity {
  id: string;
  tenantId: string;
  yearLabel: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isClosed: boolean;
  createdAt: Date;
}

export interface AccountingPeriodEntity {
  id: string;
  tenantId: string;
  fiscalYearId: string;
  periodNumber: number;
  periodName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: AccountingPeriodStatus;
  closedAt?: Date;
  closedByUserId?: string;
  createdAt: Date;
}
