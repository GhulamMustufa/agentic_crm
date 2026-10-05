import { Module } from '@nestjs/common';

import { LedgerController } from './controllers/ledger.controller';
import { LEDGER_REPOSITORY_TOKEN } from './domain/ledger.repository.interface';
import { InMemoryLedgerRepository } from './repositories/in-memory-ledger.repository';
import { LedgerService } from './services/ledger.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [LedgerController],
  providers: [
    LedgerService,
    {
      provide: LEDGER_REPOSITORY_TOKEN,
      useClass: InMemoryLedgerRepository,
    },
  ],
  exports: [LedgerService, LEDGER_REPOSITORY_TOKEN],
})
export class LedgerModule {}
