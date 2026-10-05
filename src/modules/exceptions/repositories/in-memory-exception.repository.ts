import { Injectable } from '@nestjs/common';

import { ExceptionEntity, ExceptionStatus } from '../domain/exception.entity';
import { IExceptionRepository } from '../domain/exception.repository.interface';

@Injectable()
export class InMemoryExceptionRepository implements IExceptionRepository {
  private readonly exceptions: Map<string, ExceptionEntity> = new Map();

  async create(exception: ExceptionEntity): Promise<ExceptionEntity> {
    this.exceptions.set(exception.id, exception);
    return exception;
  }

  async findById(id: string, tenantId: string): Promise<ExceptionEntity | null> {
    const exception = this.exceptions.get(id);
    if (exception && exception.tenantId === tenantId) {
      return exception;
    }
    return null;
  }

  async findAll(tenantId: string, status?: ExceptionStatus): Promise<ExceptionEntity[]> {
    const all = Array.from(this.exceptions.values()).filter(e => e.tenantId === tenantId);
    if (status) {
      return all.filter(e => e.status === status);
    }
    return all;
  }

  async update(exception: ExceptionEntity): Promise<ExceptionEntity> {
    this.exceptions.set(exception.id, exception);
    return exception;
  }
}
