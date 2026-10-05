import { Module } from '@nestjs/common';

import { BankingController } from './controllers/banking.controller';
import { BANKING_REPOSITORY_TOKEN } from './domain/banking.repository.interface';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { PdfStatementParser } from './parsers/pdf-statement.parser';
import { InMemoryBankingRepository } from './repositories/in-memory-banking.repository';
import { AiAccountantService } from './services/ai-accountant.service';
import { BankProcessingService } from './services/bank-processing.service';
import { AuditModule } from '../audit/audit.module';
import { CounterpartyModule } from '../counterparties/counterparty.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule, CounterpartyModule, InvoiceModule, AuditModule],
  controllers: [BankingController],
  providers: [
    BankProcessingService,
    AiAccountantService,
    CsvStatementParser,
    PdfStatementParser,
    {
      provide: BANKING_REPOSITORY_TOKEN,
      useClass: InMemoryBankingRepository,
    },
  ],
  exports: [BankProcessingService, AiAccountantService, BANKING_REPOSITORY_TOKEN],
})
export class BankingModule {}
