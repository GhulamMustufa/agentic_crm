import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { TenantContext } from '../context/tenant-context.service';
import { AuthorizationError } from '../errors/app-error';

export const FEATURE_FLAG_KEY = 'feature_flag';
export const RequireFeature = (featureName: string) => SetMetadata(FEATURE_FLAG_KEY, featureName);

export interface FeatureFlagConfig {
  name: string;
  defaultEnabled: boolean;
  tenantOverrides?: Record<string, boolean>;
}

@Injectable()
export class FeatureFlagService {
  private readonly flags = new Map<string, FeatureFlagConfig>();

  constructor() {
    // Default system flags
    this.registerFlag({ name: 'ai_auto_posting', defaultEnabled: true });
    this.registerFlag({ name: 'beta_payroll', defaultEnabled: false });
    this.registerFlag({ name: 'beta_inventory', defaultEnabled: false });
  }

  registerFlag(config: FeatureFlagConfig): void {
    this.flags.set(config.name, config);
  }

  isEnabled(featureName: string, tenantId?: string): boolean {
    const flag = this.flags.get(featureName);
    if (!flag) {
      return false;
    }

    if (tenantId && flag.tenantOverrides && tenantId in flag.tenantOverrides) {
      return Boolean(flag.tenantOverrides[tenantId]);
    }

    return flag.defaultEnabled;
  }

  setTenantOverride(featureName: string, tenantId: string, enabled: boolean): void {
    const flag = this.flags.get(featureName);
    if (flag) {
      if (!flag.tenantOverrides) {
        flag.tenantOverrides = {};
      }
      flag.tenantOverrides[tenantId] = enabled;
    }
  }
}

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flagService: FeatureFlagService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFeature = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) {
      return true;
    }

    const tenantId = TenantContext.current?.tenantId;
    const isEnabled = this.flagService.isEnabled(requiredFeature, tenantId);

    if (!isEnabled) {
      throw new AuthorizationError(
        `Feature '${requiredFeature}' is disabled for this organization`,
      );
    }

    return true;
  }
}
