import { Global, Module } from '@nestjs/common';

import { FeatureFlagService, FeatureFlagGuard } from './feature-flag.service';

@Global()
@Module({
  providers: [FeatureFlagService, FeatureFlagGuard],
  exports: [FeatureFlagService, FeatureFlagGuard],
})
export class FeatureFlagModule {}
