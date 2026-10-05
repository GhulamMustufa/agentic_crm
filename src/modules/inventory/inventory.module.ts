import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { InventoryController } from './controllers/inventory.controller';
import { INVENTORY_REPOSITORY_TOKEN } from './domain/inventory.repository.interface';
import { PrismaInventoryRepository } from './repositories/prisma-inventory.repository';
import { InventoryService } from './services/inventory.service';

@Module({
  imports: [PrismaModule, LedgerModule, AuditModule],
  controllers: [InventoryController],
  providers: [
    {
      provide: INVENTORY_REPOSITORY_TOKEN,
      useClass: PrismaInventoryRepository,
    },
    InventoryService,
  ],
  exports: [InventoryService, INVENTORY_REPOSITORY_TOKEN],
})
export class InventoryModule {}

