import { Global, Module } from '@nestjs/common';

import { AUDIT_REPOSITORY_TOKEN } from './domain/audit.repository.interface';
import { InMemoryAuditRepository } from './repositories/in-memory-audit.repository';
import { PrismaAuditRepository } from './repositories/prisma-audit.repository';
import { AuditService } from './services/audit.service';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AuditService,
    InMemoryAuditRepository,
    PrismaAuditRepository,
    {
      provide: AUDIT_REPOSITORY_TOKEN,
      useClass: PrismaAuditRepository,
    },
  ],
  exports: [AuditService, AUDIT_REPOSITORY_TOKEN, InMemoryAuditRepository, PrismaAuditRepository],
})
export class AuditModule {}
