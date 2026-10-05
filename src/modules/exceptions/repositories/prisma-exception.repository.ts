import { Injectable } from '@nestjs/common';
import { IExceptionRepository } from '../domain/exception.repository.interface';
import { ExceptionEntity, ExceptionStatus, ExceptionType, ResolutionAction, ExceptionHistoryEntry } from '../domain/exception.entity';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma, Exception } from '@prisma/client';

@Injectable()
export class PrismaExceptionRepository implements IExceptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(model: Exception & Record<string, any>): ExceptionEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      type: model.type as ExceptionType,
      status: model.status as ExceptionStatus,
      context: {
        ...(model.context as Record<string, any> || {}),
        amount: model.amount,
        severity: model.severity,
      },
      evidence: model.evidence || {},
      aiRecommendation: model.aiProposal || '',
      confidence: model.confidence || 0,
      reason: model.description || '',
      availableActions: (model.availableActions || []) as ResolutionAction[],
      history: (model.history || []) as ExceptionHistoryEntry[],
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      resolvedAt: model.resolvedAt || undefined,
      resolvedBy: model.resolvedBy || undefined,
      resolutionAction: model.resolutionAction as ResolutionAction | undefined,
    };
  }

  private toPrisma(entity: ExceptionEntity): Prisma.ExceptionUncheckedCreateInput {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      type: entity.type,
      status: entity.status,
      description: entity.reason,
      aiProposal: entity.aiRecommendation,
      severity: "medium", // Default severity for now
      amount: Number(entity.context?.amount || 0),
      // Note: we can add context, evidence, etc to Prisma schema later if needed.
    };
  }

  async create(exception: ExceptionEntity): Promise<ExceptionEntity> {
    const created = await this.prisma.exception.create({
      data: this.toPrisma(exception),
    });
    return this.toDomain(created);
  }

  async findById(id: string, tenantId: string): Promise<ExceptionEntity | null> {
    const exception = await this.prisma.exception.findUnique({
      where: { id },
    });
    
    if (!exception || exception.tenantId !== tenantId) {
      return null;
    }
    
    return this.toDomain(exception);
  }

  async findAll(tenantId: string, status?: ExceptionStatus): Promise<ExceptionEntity[]> {
    const whereClause: Prisma.ExceptionWhereInput = { tenantId };
    if (status) {
      whereClause.status = status;
    }
    
    const exceptions = await this.prisma.exception.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });
    
    return exceptions.map(e => this.toDomain(e));
  }

  async update(exception: ExceptionEntity): Promise<ExceptionEntity> {
    const updated = await this.prisma.exception.update({
      where: { id: exception.id },
      data: this.toPrisma(exception),
    });
    return this.toDomain(updated);
  }
}
