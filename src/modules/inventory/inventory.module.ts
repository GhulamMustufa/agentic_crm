import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { InventoryController } from './controllers/inventory.controller';
import { INVENTORY_REPOSITORY_TOKEN } from './domain/inventory.repository.interface';
import { InMemoryInventoryRepository } from './repositories/in-memory-inventory.repository';
import { InventoryService } from './services/inventory.service';

@Module({
  imports: [LedgerModule, AuditModule],
  controllers: [InventoryController],
  providers: [
    {
      provide: INVENTORY_REPOSITORY_TOKEN,
      useClass: InMemoryInventoryRepository,
    },
    InventoryService,
  ],
  exports: [InventoryService, INVENTORY_REPOSITORY_TOKEN],
})
export class InventoryModule {}
