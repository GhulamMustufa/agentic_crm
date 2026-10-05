import type { CounterpartyEntity, CounterpartyType } from './counterparty.entity';

export const COUNTERPARTY_REPOSITORY_TOKEN = Symbol('COUNTERPARTY_REPOSITORY_TOKEN');

export interface CreateCounterpartyInput {
  tenantId: string;
  type: CounterpartyType;
  legalName: string;
  normalizedName: string;
  taxIdentifier?: string;
  defaultAccountId?: string;
  paymentTermsDays?: number;
}

export interface ICounterpartyRepository {
  create(input: CreateCounterpartyInput): Promise<CounterpartyEntity>;
  findById(tenantId: string, id: string): Promise<CounterpartyEntity | null>;
  findByNormalizedName(
    tenantId: string,
    normalizedName: string,
  ): Promise<CounterpartyEntity | null>;
  list(
    tenantId: string,
    type?: CounterpartyType,
    activeOnly?: boolean,
  ): Promise<CounterpartyEntity[]>;
  update(
    tenantId: string,
    id: string,
    updates: Partial<
      Pick<
        CounterpartyEntity,
        | 'legalName'
        | 'normalizedName'
        | 'taxIdentifier'
        | 'defaultAccountId'
        | 'paymentTermsDays'
        | 'isActive'
      >
    >,
  ): Promise<CounterpartyEntity>;
}
