import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CounterpartyModule } from '../counterparties/counterparty.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { LedgerModule } from '../ledger/ledger.module';
import { BankingController } from './controllers/banking.controller';
import { BANKING_REPOSITORY_TOKEN } from './domain/banking.repository.interface';
import { AmBankAdapter } from './parsers/adapters/ambank.adapter';
import { BankAdapterRegistry } from './parsers/adapters/bank-adapter.registry';
import { BankIslamAdapter } from './parsers/adapters/bank-islam.adapter';
import { CimbAdapter } from './parsers/adapters/cimb.adapter';
import { GenericBankAdapter } from './parsers/adapters/generic-bank.adapter';
import { HongLeongAdapter } from './parsers/adapters/hong-leong.adapter';
import { MaybankAdapter } from './parsers/adapters/maybank.adapter';
import { PublicBankAdapter } from './parsers/adapters/public-bank.adapter';
import { RhbAdapter } from './parsers/adapters/rhb.adapter';
import { AiStatementParser } from './parsers/ai-statement.parser';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { DocumentInspectorService } from './parsers/layout/document-inspector.service';
import { LayoutExtractorService } from './parsers/layout/layout-extractor.service';
import { PdfStatementParser } from './parsers/pdf-statement.parser';
import { StatementProcessor } from './queues/statement.processor';
import { PrismaBankingRepository } from './repositories/prisma-banking.repository';
import { AiAccountantService } from './services/ai-accountant.service';
import { BankProcessingService } from './services/bank-processing.service';
import { StatementValidationService } from './services/statement-validation.service';

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
    StatementValidationService,
    AiAccountantService,
    CsvStatementParser,
    AiStatementParser,
    GenericBankAdapter,
    MaybankAdapter,
    CimbAdapter,
    PublicBankAdapter,
    RhbAdapter,
    HongLeongAdapter,
    AmBankAdapter,
    BankIslamAdapter,
    BankAdapterRegistry,
    DocumentInspectorService,
    LayoutExtractorService,
    PdfStatementParser,
    StatementProcessor,
    {
      provide: BANKING_REPOSITORY_TOKEN,
      useClass: PrismaBankingRepository,
    },
  ],
  exports: [
    BankProcessingService,
    StatementValidationService,
    AiAccountantService,
    GenericBankAdapter,
    MaybankAdapter,
    CimbAdapter,
    PublicBankAdapter,
    RhbAdapter,
    HongLeongAdapter,
    AmBankAdapter,
    BankIslamAdapter,
    BankAdapterRegistry,
    DocumentInspectorService,
    LayoutExtractorService,
    BANKING_REPOSITORY_TOKEN,
  ],
})
export class BankingModule {}
