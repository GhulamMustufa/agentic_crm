'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { BrandLogo } from '@/components/brand/brand-logo';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, { message: 'Password must be at least 8 characters' }).max(100),
    confirmPassword: z.string().min(1, { message: 'Please confirm your password' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [isLoading, setIsLoading] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(data: ResetPasswordFormValues) {
    if (!token) {
      setErrorMessage('Reset token is missing. Please request a new link.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await apiClient.post('/auth/reset-password', {
        token,
        newPassword: data.password,
      });

      setIsSuccess(true);
      toast.success('Password reset successfully!');
      // Short delay before routing so user sees the checkmark
      setTimeout(() => {
        router.push('/login?reset=success');
      }, 1500);
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        'This password reset link is invalid or has expired. Please request a new link.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Token missing state
  if (!token) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4 text-center">
          <div className="mx-auto p-3 rounded-full bg-destructive/10 text-destructive w-fit">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Invalid Reset Link</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            No recovery token was found in the link. Please make sure you copied the complete URL
            from your email, or request a new reset link.
          </p>
          <div className="pt-2">
            <Link href="/forgot-password">
              <Button className="w-full text-xs font-semibold h-10 cursor-pointer">
                Request a new link
              </Button>
            </Link>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/40 py-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline underline-offset-4 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign in</span>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      {isSuccess ? (
        <CardContent className="pt-6 space-y-6 text-center">
          <div className="mx-auto p-3.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-8 ring-emerald-500/5 w-fit">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Password Reset Complete!</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your password has been changed. Redirecting you to sign in...
            </p>
          </div>
          <div className="pt-2">
            <Link href="/login?reset=success">
              <Button className="w-full text-xs font-semibold h-10 cursor-pointer">
                Sign in now
              </Button>
            </Link>
          </div>
        </CardContent>
      ) : (
        <CardContent className="pt-6">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              <div>
                <Link
                  href="/forgot-password"
                  className="font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  Request a new reset link →
                </Link>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="pl-9 pr-10"
                  {...register('password')}
                />
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive font-medium">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="pl-9 pr-10"
                  {...register('confirmPassword')}
                />
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-destructive font-medium">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full font-semibold cursor-pointer"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting password...
                </>
              ) : (
                'Set New Password'
              )}
            </Button>
          </form>
        </CardContent>
      )}

      <CardFooter className="flex justify-center border-t border-border/40 py-4 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline underline-offset-4 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign in</span>
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Link
          href="/"
          title="Go to Home"
          className="transition-transform hover:scale-105 cursor-pointer"
        >
          <BrandLogo size={48} className="rounded-xl shadow-md border-cyan-500/30" priority />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Create new password</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Please enter and confirm your new account password below.
        </p>
      </div>

      <React.Suspense
        fallback={
          <Card>
            <CardContent className="pt-6 flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </CardContent>
          </Card>
        }
      >
        <ResetPasswordContent />
      </React.Suspense>
    </div>
  );
}
