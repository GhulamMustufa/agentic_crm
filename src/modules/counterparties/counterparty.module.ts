import { Module } from '@nestjs/common';

import { CounterpartyController } from './controllers/counterparty.controller';
import { COUNTERPARTY_REPOSITORY_TOKEN } from './domain/counterparty.repository.interface';
import { InMemoryCounterpartyRepository } from './repositories/in-memory-counterparty.repository';
import { CounterpartyService } from './services/counterparty.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CounterpartyController],
  providers: [
    CounterpartyService,
    {
      provide: COUNTERPARTY_REPOSITORY_TOKEN,
      useClass: InMemoryCounterpartyRepository,
    },
  ],
  exports: [CounterpartyService, COUNTERPARTY_REPOSITORY_TOKEN],
})
export class CounterpartyModule {}
