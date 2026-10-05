import { ExceptionEntity, ExceptionStatus } from './exception.entity';

export const EXCEPTION_REPOSITORY_TOKEN = Symbol('EXCEPTION_REPOSITORY_TOKEN');

export interface IExceptionRepository {
  create(exception: ExceptionEntity): Promise<ExceptionEntity>;
  findById(id: string, tenantId: string): Promise<ExceptionEntity | null>;
  findAll(tenantId: string, status?: ExceptionStatus): Promise<ExceptionEntity[]>;
  update(exception: ExceptionEntity): Promise<ExceptionEntity>;
}
