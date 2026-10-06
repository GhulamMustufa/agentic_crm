import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CounterpartyModule } from '../counterparties/counterparty.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { LedgerModule } from '../ledger/ledger.module';
import { BankingController } from './controllers/banking.controller';
import { BANKING_REPOSITORY_TOKEN } from './domain/banking.repository.interface';
import { AiStatementParser } from './parsers/ai-statement.parser';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { PdfStatementParser } from './parsers/pdf-statement.parser';
import { StatementProcessor } from './queues/statement.processor';
import { PrismaBankingRepository } from './repositories/prisma-banking.repository';
import { AiAccountantService } from './services/ai-accountant.service';
import { BankProcessingService } from './services/bank-processing.service';

@Module({
  imports: [
    PrismaModule,
    LedgerModule,
    CounterpartyModule,
    InvoiceModule,
    AuditModule,
    BullModule.registerQueue({
      name: 'statement-processing',
    }),
  ],
  controllers: [BankingController],
  providers: [
    BankProcessingService,
    AiAccountantService,
    CsvStatementParser,
    AiStatementParser,
    PdfStatementParser,
    StatementProcessor,
    {
      provide: BANKING_REPOSITORY_TOKEN,
      useClass: PrismaBankingRepository,
    },
  ],
  exports: [BankProcessingService, AiAccountantService, BANKING_REPOSITORY_TOKEN],
})
export class BankingModule {}
