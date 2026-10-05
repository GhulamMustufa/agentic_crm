import { Global, Module } from '@nestjs/common';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [PasswordHasher, TokenService, JwtAuthGuard, RolesGuard],
  exports: [PasswordHasher, TokenService, JwtAuthGuard, RolesGuard],
})
export class SecurityModule {}
