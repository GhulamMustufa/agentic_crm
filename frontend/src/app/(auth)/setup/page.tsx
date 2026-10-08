'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Building, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

const setupSchema = z.object({
  companyName: z.string().min(2, { message: 'Company name is required' }),
  industry: z.string().min(2, { message: 'Industry is required' }),
  baseCurrency: z.string().min(3).max(3),
  registrationNumber: z.string().optional(),
});

type SetupFormValues = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      companyName: '',
      industry: '',
      baseCurrency: 'MYR',
      registrationNumber: '',
    },
  });

  async function onSubmit(data: SetupFormValues) {
    setIsLoading(true);

    try {
      const slug =
        data.companyName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 50) +
        '-' +
        Math.random().toString(36).slice(2, 6);

      // 1. Create Organization
      const orgRes = await apiClient.post<{ data: { id: string; name: string } }>(
        '/organizations',
        {
          legalName: data.companyName,
          slug,
          baseCurrency: data.baseCurrency,
        },
      );

      const tenantId = orgRes.data.id;
      authStorage.setActiveTenantId(tenantId);
      authStorage.setTenantCurrency(data.baseCurrency);

      // 2. Seed Standard Chart of Accounts (COA)
      try {
        await apiClient.post('/ledger/accounts/seed-standard', {});
      } catch (err) {
        // Accounts might already be seeded or skipped
        console.warn('COA seed notice:', err);
      }

      router.push('/');
    } catch (err: unknown) {
      // API client will automatically show the error toast
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Building className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set up your organization</h1>
        <p className="text-sm text-muted-foreground">
          Let&apos;s get your workspace ready for your AI Accountant.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                placeholder="Acme Corp"
                disabled={isLoading}
                {...register('companyName')}
              />
              {errors.companyName && (
                <p className="text-sm text-destructive font-medium">{errors.companyName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  placeholder="Technology, Retail, etc."
                  disabled={isLoading}
                  {...register('industry')}
                />
                {errors.industry && (
                  <p className="text-sm text-destructive font-medium">{errors.industry.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseCurrency">Primary Operating Currency</Label>
                <select
                  id="baseCurrency"
                  disabled={isLoading}
                  {...register('baseCurrency')}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono font-medium"
                >
                  <option value="MYR">MYR (RM) - Malaysian Ringgit</option>
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="SGD">SGD ($) - Singapore Dollar</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="registrationNumber">Company Registration Number (Optional)</Label>
              <Input
                id="registrationNumber"
                placeholder="Leave blank if not applicable"
                disabled={isLoading}
                {...register('registrationNumber')}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating workspace...
                </>
              ) : (
                'Complete setup'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-center text-xs text-muted-foreground justify-center">
          By completing setup, you agree to our Terms of Service and Privacy Policy.
        </CardFooter>
      </Card>
    </div>
  );
}
