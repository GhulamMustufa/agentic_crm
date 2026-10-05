import { Module } from '@nestjs/common';

import { LedgerController } from './controllers/ledger.controller';
import { LEDGER_REPOSITORY_TOKEN } from './domain/ledger.repository.interface';
import { PrismaLedgerRepository } from './repositories/prisma-ledger.repository';
import { LedgerService } from './services/ledger.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [LedgerController],
  providers: [
    LedgerService,
    {
      provide: LEDGER_REPOSITORY_TOKEN,
      useClass: PrismaLedgerRepository,
    },
  ],
  exports: [LedgerService, LEDGER_REPOSITORY_TOKEN],
})
export class LedgerModule {}
