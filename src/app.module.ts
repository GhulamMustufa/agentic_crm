import { Module } from '@nestjs/common';

import { AiModule } from './core/ai/ai.module';
import { ConfigModule } from './core/config/config.module';
import { ContextModule } from './core/context/context.module';
import { FeatureFlagModule } from './core/feature-flags/feature-flag.module';
import { LoggingModule } from './core/logging/logging.module';
import { QueueModule } from './core/queue/queue.module';
import { SecurityModule } from './core/security/security.module';
import { StorageModule } from './core/storage/storage.module';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrganizationModule } from './modules/organization/organization.module';

@Module({
  imports: [
    ConfigModule,
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
  ],
})
export class AppModule {}
