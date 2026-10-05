import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CounterpartyModule } from '../counterparties/counterparty.module';
import { LedgerModule } from '../ledger/ledger.module';
import { InvoiceController } from './controllers/invoice.controller';
import { INVOICE_REPOSITORY_TOKEN } from './domain/invoice.repository.interface';
import { PrismaInvoiceRepository } from './repositories/prisma-invoice.repository';
import { InvoiceService } from './services/invoice.service';

@Module({
  imports: [PrismaModule, LedgerModule, CounterpartyModule, AuditModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    {
      provide: INVOICE_REPOSITORY_TOKEN,
      useClass: PrismaInvoiceRepository,
    },
  ],
  exports: [InvoiceService, INVOICE_REPOSITORY_TOKEN],
})
export class InvoiceModule {}
