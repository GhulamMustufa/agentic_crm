import { Inject, Injectable } from '@nestjs/common';

import { ValidationError, NotFoundError } from '../../../core/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import {
  COUNTERPARTY_REPOSITORY_TOKEN,
  type ICounterpartyRepository,
} from '../domain/counterparty.repository.interface';
import {
  type CreateCounterpartyInput,
  type UpdateCounterpartyInput,
  createCounterpartySchema,
  updateCounterpartySchema,
} from '../dto/counterparty.dto';

import type { CounterpartyEntity, CounterpartyType } from '../domain/counterparty.entity';

export function normalizeCounterpartyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class CounterpartyService {
  constructor(
    @Inject(COUNTERPARTY_REPOSITORY_TOKEN)
    private readonly counterpartyRepo: ICounterpartyRepository,
    private readonly auditService: AuditService,
  ) {}

  async createCounterparty(
    tenantId: string,
    userId: string,
    rawDto: CreateCounterpartyInput,
  ): Promise<CounterpartyEntity> {
    const parseResult = createCounterpartySchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Counterparty validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;
    const normalizedName = normalizeCounterpartyName(dto.legalName);

    const entity = await this.counterpartyRepo.create({
      tenantId,
      type: dto.type,
      legalName: dto.legalName,
      normalizedName,
      taxIdentifier: dto.taxIdentifier,
      defaultAccountId: dto.defaultAccountId,
      paymentTermsDays: dto.paymentTermsDays,
    });

    await this.auditService.recordEvent({
      tenantId,
      action: 'COUNTERPARTY_CREATED',
      entityType: 'COUNTERPARTY',
      entityId: entity.id,
      actorType: 'USER',
      actorId: userId,
      newState: { legalName: entity.legalName, type: entity.type },
    });

    return entity;
  }

  async findById(tenantId: string, id: string): Promise<CounterpartyEntity> {
    const item = await this.counterpartyRepo.findById(tenantId, id);
    if (!item) {
      throw new NotFoundError('Counterparty', id);
    }
    return item;
  }

  async listCounterparties(
    tenantId: string,
    type?: CounterpartyType,
    activeOnly = false,
  ): Promise<CounterpartyEntity[]> {
    return this.counterpartyRepo.list(tenantId, type, activeOnly);
  }

  async updateCounterparty(
    tenantId: string,
    userId: string,
    id: string,
    rawDto: UpdateCounterpartyInput,
  ): Promise<CounterpartyEntity> {
    const parseResult = updateCounterpartySchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Counterparty update validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const previous = await this.findById(tenantId, id);
    const normalizedName = dto.legalName ? normalizeCounterpartyName(dto.legalName) : undefined;

    const updated = await this.counterpartyRepo.update(tenantId, id, {
      ...dto,
      normalizedName,
    });

    await this.auditService.recordEvent({
      tenantId,
      action: 'COUNTERPARTY_UPDATED',
      entityType: 'COUNTERPARTY',
      entityId: id,
      actorType: 'USER',
      actorId: userId,
      previousState: { legalName: previous.legalName },
      newState: { legalName: updated.legalName },
    });

    return updated;
  }
}
