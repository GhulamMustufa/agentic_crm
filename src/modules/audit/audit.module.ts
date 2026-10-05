import { Global, Module } from '@nestjs/common';

import { AUDIT_REPOSITORY_TOKEN } from './domain/audit.repository.interface';
import { InMemoryAuditRepository } from './repositories/in-memory-audit.repository';
import { AuditService } from './services/audit.service';

@Global()
@Module({
  providers: [
    AuditService,
    InMemoryAuditRepository,
    {
      provide: AUDIT_REPOSITORY_TOKEN,
      useExisting: InMemoryAuditRepository,
    },
  ],
  exports: [AuditService, AUDIT_REPOSITORY_TOKEN, InMemoryAuditRepository],
})
export class AuditModule {}
