import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';

import { AiModule } from './core/ai/ai.module';
import { ConfigModule } from './core/config/config.module';
import { AppConfigService } from './core/config/config.service';
import { ContextModule } from './core/context/context.module';
import { FeatureFlagModule } from './core/feature-flags/feature-flag.module';
import { LoggingModule } from './core/logging/logging.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { QueueModule } from './core/queue/queue.module';
import { SecurityModule } from './core/security/security.module';
import { StorageModule } from './core/storage/storage.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AuditModule } from './modules/audit/audit.module';
import { BankingModule } from './modules/banking/banking.module';
import { CounterpartyModule } from './modules/counterparties/counterparty.module';
import { ExceptionsModule } from './modules/exceptions/exceptions.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InvoiceModule } from './modules/invoices/invoice.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PayrollModule } from './modules/payroll/payroll.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: {
          url: config.get('REDIS_URL'),
        },
      }),
    }),
    ConfigModule,
    PrismaModule,
    LoggingModule,
    ContextModule,
    SecurityModule,
    StorageModule,
    QueueModule,
    AiModule,
    FeatureFlagModule,
    IdentityModule,
    OrganizationModule,
    AuditModule,
    LedgerModule,
    CounterpartyModule,
    InvoiceModule,
    BankingModule,
    PayrollModule,
    InventoryModule,
    AgentsModule,
    ExceptionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
