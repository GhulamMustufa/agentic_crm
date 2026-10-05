import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';

import type { CounterpartyEntity, CounterpartyType } from '../domain/counterparty.entity';
import type {
  ICounterpartyRepository,
  CreateCounterpartyInput,
} from '../domain/counterparty.repository.interface';

@Injectable()
export class InMemoryCounterpartyRepository implements ICounterpartyRepository {
  private readonly counterparties = new Map<string, CounterpartyEntity>();

  async create(input: CreateCounterpartyInput): Promise<CounterpartyEntity> {
    const existing = await this.findByNormalizedName(input.tenantId, input.normalizedName);
    if (existing) {
      throw new ConflictError(
        `Counterparty with name '${input.legalName}' already exists for this organization`,
      );
    }

    const now = new Date();
    const entity: CounterpartyEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      type: input.type,
      legalName: input.legalName.trim(),
      normalizedName: input.normalizedName,
      taxIdentifier: input.taxIdentifier?.trim(),
      defaultAccountId: input.defaultAccountId,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.counterparties.set(entity.id, { ...entity });
    return { ...entity };
  }

  async findById(tenantId: string, id: string): Promise<CounterpartyEntity | null> {
    const item = this.counterparties.get(id);
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return { ...item };
  }

  async findByNormalizedName(
    tenantId: string,
    normalizedName: string,
  ): Promise<CounterpartyEntity | null> {
    for (const item of this.counterparties.values()) {
      if (item.tenantId === tenantId && item.normalizedName === normalizedName) {
        return { ...item };
      }
    }
    return null;
  }

  async list(
    tenantId: string,
    type?: CounterpartyType,
    activeOnly = false,
  ): Promise<CounterpartyEntity[]> {
    return Array.from(this.counterparties.values())
      .filter((c) => {
        if (c.tenantId !== tenantId) {
          return false;
        }
        if (activeOnly && !c.isActive) {
          return false;
        }
        if (type && c.type !== type && c.type !== 'BOTH') {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.legalName.localeCompare(b.legalName))
      .map((c) => ({ ...c }));
  }

  async update(
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
  ): Promise<CounterpartyEntity> {
    const item = await this.findById(tenantId, id);
    if (!item) {
      throw new NotFoundError('Counterparty', id);
    }

    const updated: CounterpartyEntity = {
      ...item,
      ...updates,
      updatedAt: new Date(),
      version: item.version + 1,
    };

    this.counterparties.set(id, { ...updated });
    return { ...updated };
  }
}
