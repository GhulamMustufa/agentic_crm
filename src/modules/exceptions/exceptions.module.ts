import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EXCEPTION_REPOSITORY_TOKEN } from './domain/exception.repository.interface';
import { InMemoryExceptionRepository } from './repositories/in-memory-exception.repository';
import { ExceptionService } from './services/exception.service';
import { ExceptionController } from './controllers/exception.controller';

@Module({
  imports: [AuditModule],
  controllers: [ExceptionController],
  providers: [
    {
      provide: EXCEPTION_REPOSITORY_TOKEN,
      useClass: InMemoryExceptionRepository,
    },
    ExceptionService,
  ],
  exports: [ExceptionService],
})
export class ExceptionsModule {}
