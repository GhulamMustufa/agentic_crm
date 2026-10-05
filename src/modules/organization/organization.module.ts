import { Module } from '@nestjs/common';

import { OrganizationController } from './controllers/organization.controller';
import { TENANT_REPOSITORY_TOKEN } from './domain/tenant.repository.interface';
import { InMemoryTenantRepository } from './repositories/in-memory-tenant.repository';
import { OrganizationService } from './services/organization.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [IdentityModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    InMemoryTenantRepository,
    {
      provide: TENANT_REPOSITORY_TOKEN,
      useExisting: InMemoryTenantRepository,
    },
  ],
  exports: [OrganizationService, TENANT_REPOSITORY_TOKEN, InMemoryTenantRepository],
})
export class OrganizationModule {}
