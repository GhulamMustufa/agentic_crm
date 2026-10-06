'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Bot, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('expired') === 'true') {
        setServerError('Your session has expired. Please sign in again.');
        // Clean up the URL
        window.history.replaceState({}, '', '/login');
      }
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    setServerError(null);

    try {
      // 1. Authenticate
      const res = await apiClient.post<{
        data: {
          user: { id: string; email: string; fullName: string };
          tokens: { accessToken: string; refreshToken: string };
        };
      }>('/auth/login', {
        email: data.email,
        password: data.password,
      });

      authStorage.setAuthSession(res.data.tokens, res.data.user);

      // 2. Fetch Organizations
      try {
        const orgsRes = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
          '/organizations',
        );
        const orgs = orgsRes.data || [];
        if (orgs.length > 0) {
          authStorage.setActiveTenantId(orgs[0].id);
          router.push('/');
        } else {
          router.push('/setup');
        }
      } catch {
        router.push('/');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Invalid email or password. Please try again.';
      setServerError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Enter your email to sign in to your account</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                disabled={isLoading}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive font-medium">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" disabled={isLoading} {...register('password')} />
              {errors.password && (
                <p className="text-sm text-destructive font-medium">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {serverError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center text-sm">
          <Link href="#" className="text-primary hover:underline underline-offset-4">
            Forgot your password?
          </Link>
          <div className="text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="text-primary font-medium hover:underline underline-offset-4"
            >
              Sign up
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
