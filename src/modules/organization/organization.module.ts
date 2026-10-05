import { Module } from '@nestjs/common';

import { OrganizationController } from './controllers/organization.controller';
import { TENANT_REPOSITORY_TOKEN } from './domain/tenant.repository.interface';
import { PrismaTenantRepository } from './repositories/prisma-tenant.repository';
import { OrganizationService } from './services/organization.service';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [IdentityModule, PrismaModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    {
      provide: TENANT_REPOSITORY_TOKEN,
      useClass: PrismaTenantRepository,
    },
  ],
  exports: [OrganizationService, TENANT_REPOSITORY_TOKEN],
})
export class OrganizationModule {}
