import { Module, forwardRef } from '@nestjs/common';

import { AuthController } from './controllers/auth.controller';
import { USER_REPOSITORY_TOKEN } from './domain/user.repository.interface';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { AuthService } from './services/auth.service';
import { EmailModule } from '../../core/email/email.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [PrismaModule, EmailModule, forwardRef(() => OrganizationModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: USER_REPOSITORY_TOKEN,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [AuthService, USER_REPOSITORY_TOKEN],
})
export class IdentityModule {}
