export type BankAccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD';

export interface BankAccountEntity {
  id: string;
  tenantId: string;
  ledgerAccountId: string; // Linked Cash/Bank Asset Account in COA (e.g., 1010)
  accountName: string;
  institutionName: string;
  accountType: BankAccountType;
  currency: string;
  accountNumberLast4: string;
  currentBalanceCents: bigint;
  reconciledBalanceCents: bigint;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
