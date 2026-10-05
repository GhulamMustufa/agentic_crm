import { Module } from '@nestjs/common';

import { AuthController } from './controllers/auth.controller';
import { USER_REPOSITORY_TOKEN } from './domain/user.repository.interface';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository';
import { AuthService } from './services/auth.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    InMemoryUserRepository,
    {
      provide: USER_REPOSITORY_TOKEN,
      useExisting: InMemoryUserRepository,
    },
  ],
  exports: [AuthService, USER_REPOSITORY_TOKEN, InMemoryUserRepository],
})
export class IdentityModule {}
