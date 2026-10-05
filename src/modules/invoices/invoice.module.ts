import { Module } from '@nestjs/common';

import { InvoiceController } from './controllers/invoice.controller';
import { INVOICE_REPOSITORY_TOKEN } from './domain/invoice.repository.interface';
import { InMemoryInvoiceRepository } from './repositories/in-memory-invoice.repository';
import { InvoiceService } from './services/invoice.service';
import { AuditModule } from '../audit/audit.module';
import { CounterpartyModule } from '../counterparties/counterparty.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule, CounterpartyModule, AuditModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    {
      provide: INVOICE_REPOSITORY_TOKEN,
      useClass: InMemoryInvoiceRepository,
    },
  ],
  exports: [InvoiceService, INVOICE_REPOSITORY_TOKEN],
})
export class InvoiceModule {}
