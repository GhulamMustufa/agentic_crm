import { Module } from '@nestjs/common';

import { AuthController } from './controllers/auth.controller';
import { USER_REPOSITORY_TOKEN } from './domain/user.repository.interface';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { AuthService } from './services/auth.service';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
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
