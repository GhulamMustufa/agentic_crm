'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

export function useTenantCurrency(): string {
  const tenantId = typeof window !== 'undefined' ? authStorage.getActiveTenantId() : null;

  const { data: tenant } = useQuery({
    queryKey: ['tenant-details', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await apiClient.get<{
        data: { id: string; legalName: string; baseCurrency: string };
      }>(`/organizations/${tenantId}`, { silent: true });
      if (res.data?.baseCurrency) {
        authStorage.setTenantCurrency(res.data.baseCurrency);
      }
      return res.data;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    tenant?.baseCurrency ||
    (typeof window !== 'undefined' ? authStorage.getTenantCurrency() : 'MYR') ||
    'MYR'
  );
}
