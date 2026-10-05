import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CounterpartyModule } from '../counterparties/counterparty.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { LedgerModule } from '../ledger/ledger.module';
import { BankingController } from './controllers/banking.controller';
import { BANKING_REPOSITORY_TOKEN } from './domain/banking.repository.interface';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { PdfStatementParser } from './parsers/pdf-statement.parser';
import { PrismaBankingRepository } from './repositories/prisma-banking.repository';
import { AiAccountantService } from './services/ai-accountant.service';
import { BankProcessingService } from './services/bank-processing.service';

@Module({
  imports: [PrismaModule, LedgerModule, CounterpartyModule, InvoiceModule, AuditModule],
  controllers: [BankingController],
  providers: [
    BankProcessingService,
    AiAccountantService,
    CsvStatementParser,
    PdfStatementParser,
    {
      provide: BANKING_REPOSITORY_TOKEN,
      useClass: PrismaBankingRepository,
    },
  ],
  exports: [BankProcessingService, AiAccountantService, BANKING_REPOSITORY_TOKEN],
})
export class BankingModule {}
