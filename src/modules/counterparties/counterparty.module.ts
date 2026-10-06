import { Module } from '@nestjs/common';

import { CounterpartyController } from './controllers/counterparty.controller';
import { COUNTERPARTY_REPOSITORY_TOKEN } from './domain/counterparty.repository.interface';
import { PrismaCounterpartyRepository } from './repositories/prisma-counterparty.repository';
import { CounterpartyService } from './services/counterparty.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [CounterpartyController],
  providers: [
    CounterpartyService,
    {
      provide: COUNTERPARTY_REPOSITORY_TOKEN,
      useClass: PrismaCounterpartyRepository,
    },
  ],
  exports: [CounterpartyService, COUNTERPARTY_REPOSITORY_TOKEN],
})
export class CounterpartyModule {}
