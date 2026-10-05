export type AccountClassification = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountEntity {
  id: string;
  tenantId: string;
  accountCode: string;
  name: string;
  classification: AccountClassification;
  subClassification?: string;
  parentAccountId?: string;
  isActive: boolean;
  isSystemLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/**
 * Returns true if the account normal balance is DEBIT (Assets, Expenses).
 * Debits increase the balance; credits decrease the balance.
 */
export function isDebitNormal(classification: AccountClassification): boolean {
  return classification === 'ASSET' || classification === 'EXPENSE';
}

/**
 * Returns true if the account normal balance is CREDIT (Liabilities, Equity, Revenue).
 * Credits increase the balance; debits decrease the balance.
 */
export function isCreditNormal(classification: AccountClassification): boolean {
  return (
    classification === 'LIABILITY' || classification === 'EQUITY' || classification === 'REVENUE'
  );
}
