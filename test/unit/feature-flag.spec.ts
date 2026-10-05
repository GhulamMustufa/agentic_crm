import { describe, it, expect, beforeEach } from 'vitest';

import { FeatureFlagService } from '@/core/feature-flags/feature-flag.service';

describe('FeatureFlagService', () => {
  let flagService: FeatureFlagService;

  beforeEach(() => {
    flagService = new FeatureFlagService();
  });

  it('should return default state for registered flags', () => {
    expect(flagService.isEnabled('ai_auto_posting')).toBe(true);
    expect(flagService.isEnabled('beta_payroll')).toBe(false);
  });

  it('should return false for unknown flags', () => {
    expect(flagService.isEnabled('non_existent_flag')).toBe(false);
  });

  it('should evaluate tenant overrides correctly', () => {
    flagService.setTenantOverride('beta_payroll', 'tenant_vip', true);

    expect(flagService.isEnabled('beta_payroll', 'tenant_vip')).toBe(true);
    expect(flagService.isEnabled('beta_payroll', 'tenant_standard')).toBe(false);
  });
});
