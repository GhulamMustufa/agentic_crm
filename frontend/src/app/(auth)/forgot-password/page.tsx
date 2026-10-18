'use client';

import * as React from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, MailCheck, ArrowLeft, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { BrandLogo } from '@/components/brand/brand-logo';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [submittedEmail, setSubmittedEmail] = React.useState('');
  const [countdown, setCountdown] = React.useState(0);

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit(data: ForgotPasswordFormValues) {
    setIsLoading(true);

    try {
      await apiClient.post('/auth/forgot-password', {
        email: data.email,
      });

      setSubmittedEmail(data.email);
      setIsSubmitted(true);
      setCountdown(60);
      toast.success('Instructions sent! Check your email inbox.');
    } catch (err: unknown) {
      console.error(err);
      // Even on error, we don't leak user existence
      toast.error('Unable to process password reset request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

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
        <h1 className="text-2xl font-bold tracking-tight">
          {isSubmitted ? 'Check your email' : 'Forgot your password?'}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          {isSubmitted
            ? `If an account is associated with ${submittedEmail}, you'll receive password reset instructions.`
            : 'Enter your account email and we will send you a secure link to reset your password.'}
        </p>
      </div>

      <Card>
        {isSubmitted ? (
          <CardContent className="pt-6 space-y-6">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="p-3.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-8 ring-emerald-500/5">
                <MailCheck className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The recovery link is valid for <strong>60 minutes</strong> and can only be used
                  once. Please check your spam folder if you do not see it within a few moments.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border/60 space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full text-xs font-semibold h-10 cursor-pointer"
                disabled={isLoading || countdown > 0}
                onClick={() => onSubmit({ email: submittedEmail })}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resending...
                  </>
                ) : countdown > 0 ? (
                  `Resend email in ${countdown}s`
                ) : (
                  'Resend recovery email'
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground h-10 cursor-pointer"
                onClick={() => {
                  setIsSubmitted(false);
                  setCountdown(0);
                }}
              >
                Use a different email address
              </Button>
            </div>
          </CardContent>
        ) : (
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    disabled={isLoading}
                    autoComplete="email"
                    className="pl-9"
                    {...register('email')}
                  />
                  <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive font-medium">{errors.email.message}</p>
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
                    Sending link...
                  </>
                ) : (
                  'Send password reset link'
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
    </div>
  );
}
