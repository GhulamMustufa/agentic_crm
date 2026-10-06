import { Injectable } from '@nestjs/common';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type { CounterpartyEntity, CounterpartyType } from '../domain/counterparty.entity';
import type {
  ICounterpartyRepository,
  CreateCounterpartyInput,
} from '../domain/counterparty.repository.interface';
import type { Counterparty } from '@prisma/client';

@Injectable()
export class PrismaCounterpartyRepository implements ICounterpartyRepository {
  private readonly knownTenants = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTenantExists(tenantId: string): Promise<void> {
    if (this.knownTenants.has(tenantId)) {
      return;
    }
    await this.prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        slug: tenantId,
        legalName: `Tenant ${tenantId}`,
      },
    });
    this.knownTenants.add(tenantId);
  }

  private toDomainEntity(model: Counterparty): CounterpartyEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      type: model.type as CounterpartyType,
      legalName: model.legalName,
      normalizedName: model.normalizedName,
      taxIdentifier: model.taxIdentifier || undefined,
      defaultAccountId: model.defaultAccountId || undefined,
      paymentTermsDays: model.paymentTermsDays,
      isActive: model.isActive,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  async create(input: CreateCounterpartyInput): Promise<CounterpartyEntity> {
    await this.ensureTenantExists(input.tenantId);

    const existing = await this.findByNormalizedName(input.tenantId, input.normalizedName);
    if (existing) {
      throw new ConflictError(
        `Counterparty with name '${input.legalName}' already exists for this organization`,
      );
    }

    const created = await this.prisma.counterparty.create({
      data: {
        tenantId: input.tenantId,
        type: input.type,
        legalName: input.legalName.trim(),
        normalizedName: input.normalizedName,
        taxIdentifier: input.taxIdentifier?.trim(),
        defaultAccountId: input.defaultAccountId,
        paymentTermsDays: input.paymentTermsDays ?? 30,
        isActive: true,
      },
    });

    return this.toDomainEntity(created);
  }

  async findById(tenantId: string, id: string): Promise<CounterpartyEntity | null> {
    const item = await this.prisma.counterparty.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toDomainEntity(item);
  }

  async findByNormalizedName(
    tenantId: string,
    normalizedName: string,
  ): Promise<CounterpartyEntity | null> {
    const item = await this.prisma.counterparty.findUnique({
      where: {
        tenantId_normalizedName: {
          tenantId,
          normalizedName,
        },
      },
    });
    return item ? this.toDomainEntity(item) : null;
  }

  async list(
    tenantId: string,
    type?: CounterpartyType,
    activeOnly = false,
  ): Promise<CounterpartyEntity[]> {
    const items = await this.prisma.counterparty.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
        ...(type ? { OR: [{ type }, { type: 'BOTH' }] } : {}),
      },
      orderBy: { legalName: 'asc' },
    });

    return items.map((item) => this.toDomainEntity(item));
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

    const updated = await this.prisma.counterparty.update({
      where: { id },
      data: {
        ...(updates.legalName !== undefined ? { legalName: updates.legalName.trim() } : {}),
        ...(updates.normalizedName !== undefined ? { normalizedName: updates.normalizedName } : {}),
        ...(updates.taxIdentifier !== undefined
          ? { taxIdentifier: updates.taxIdentifier?.trim() }
          : {}),
        ...(updates.defaultAccountId !== undefined
          ? { defaultAccountId: updates.defaultAccountId }
          : {}),
        ...(updates.paymentTermsDays !== undefined
          ? { paymentTermsDays: updates.paymentTermsDays }
          : {}),
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
        version: { increment: 1 },
      },
    });

    return this.toDomainEntity(updated);
  }
}
