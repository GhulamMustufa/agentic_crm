'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  Building2,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

interface InviteDetails {
  email: string;
  roleCode: string;
  tenantName: string;
  inviterName: string;
  isExistingUser: boolean;
}

const acceptInviteSchema = z
  .object({
    fullName: z.string().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Validation is conditional based on whether new user fields were provided
    if (data.password !== undefined && data.password.length > 0) {
      if (data.password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Password must be at least 8 characters',
          path: ['password'],
        });
      }
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Passwords do not match',
          path: ['confirmPassword'],
        });
      }
    }
  });

type AcceptInviteFormValues = z.infer<typeof acceptInviteSchema>;

const roleDescriptions: Record<string, string> = {
  OWNER: 'Full administrative & financial authority across all company ledgers.',
  CONTROLLER: 'Approvals, monthly period closing, and authoritative journal posting.',
  BOOKKEEPER: 'Invoice recording, bank statement feeds, and draft transaction entries.',
  AUDITOR: 'Read-only financial audit, compliance monitoring, and financial reporting.',
};

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [isLoadingDetails, setIsLoadingDetails] = React.useState(true);
  const [inviteDetails, setInviteDetails] = React.useState<InviteDetails | null>(null);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInviteFormValues>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      fullName: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Fetch invitation details on mount
  React.useEffect(() => {
    if (!token) {
      setIsLoadingDetails(false);
      setDetailsError(
        'No invitation token found in this link. Please check your invitation email.',
      );
      return;
    }

    let isMounted = true;
    async function loadDetails() {
      try {
        const res = await apiClient.get<{ data: InviteDetails }>(
          `/auth/invite?token=${encodeURIComponent(token!)}`,
        );
        if (isMounted) {
          setInviteDetails(res.data);
          setIsLoadingDetails(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setDetailsError(
            err?.message ||
              'This invitation link is invalid, expired, or has already been accepted.',
          );
          setIsLoadingDetails(false);
        }
      }
    }

    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [token]);

  async function onSubmit(values: AcceptInviteFormValues) {
    if (!token) return;

    if (!inviteDetails?.isExistingUser) {
      if (!values.fullName || values.fullName.trim().length < 2) {
        toast.error('Please enter your full name (at least 2 characters)');
        return;
      }
      if (!values.password || values.password.length < 8) {
        toast.error('Please enter a secure password (at least 8 characters)');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const res = await apiClient.post<{
        data: {
          user: { id: string; email: string; fullName: string };
          tokens: { accessToken: string; refreshToken?: string; expiresIn?: string };
        };
      }>('/auth/accept-invite', {
        token,
        ...(values.fullName ? { fullName: values.fullName.trim() } : {}),
        ...(values.password ? { password: values.password } : {}),
      });

      authStorage.setAuthSession(res.data.tokens, res.data.user);

      // Fetch user organizations and set active tenant
      try {
        const orgsRes = await apiClient.get<{
          data: Array<{ id: string; legalName: string; baseCurrency?: string }>;
        }>('/organizations');
        const orgs = orgsRes.data || [];
        if (orgs.length > 0) {
          // Find the tenant we just joined if possible, or fallback to first
          const matchedTenant =
            orgs.find((o) => o.legalName === inviteDetails?.tenantName) || orgs[0];
          authStorage.setActiveTenantId(matchedTenant.id);
          if (matchedTenant.baseCurrency) {
            authStorage.setTenantCurrency(matchedTenant.baseCurrency);
          }
        }
      } catch {
        // Fallback silently if organization fetch fails
      }

      setIsSuccess(true);
      toast.success(`Welcome to ${inviteDetails?.tenantName || 'your organization'}!`);

      setTimeout(() => {
        router.push('/overview');
      }, 1200);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept invitation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // 1. Loading Details State
  if (isLoadingDetails) {
    return (
      <Card className="max-w-md w-full mx-auto">
        <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground animate-pulse font-medium">
            Verifying invitation credentials...
          </p>
        </CardContent>
      </Card>
    );
  }

  // 2. Error / Expired Link State
  if (detailsError || !inviteDetails) {
    return (
      <Card className="max-w-md w-full mx-auto border-destructive/30">
        <CardContent className="pt-8 pb-8 space-y-4 text-center">
          <div className="mx-auto p-3 rounded-full bg-destructive/10 text-destructive w-fit">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Invitation Unavailable</h2>
          <p className="text-xs text-muted-foreground leading-relaxed px-4">
            {detailsError ||
              'This invitation link is invalid or expired. Please contact your organization administrator for a new invite.'}
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <Link href="/login" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full text-xs h-9 cursor-pointer">
                Return to Login
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 3. Success State
  if (isSuccess) {
    return (
      <Card className="max-w-md w-full mx-auto border-emerald-500/30">
        <CardContent className="pt-10 pb-10 space-y-4 text-center">
          <div className="mx-auto p-3 rounded-full bg-emerald-500/10 text-emerald-500 w-fit animate-in zoom-in duration-300">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Invitation Accepted!</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You are now a member of{' '}
            <strong className="text-foreground">{inviteDetails.tenantName}</strong>. Redirecting you
            to the financial overview...
          </p>
          <div className="flex items-center justify-center pt-2">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // 4. Interactive Acceptance Form
  return (
    <Card className="max-w-md w-full mx-auto shadow-sm border-border/80">
      <CardHeader className="space-y-2 pb-4 text-center sm:text-left">
        <div className="flex items-center gap-2 mb-1 justify-center sm:justify-start">
          <Badge
            variant="outline"
            className="gap-1.5 py-1 px-2.5 font-mono text-xs border-primary/20 bg-primary/5 text-primary"
          >
            <Building2 className="w-3.5 h-3.5" />
            Team Invitation
          </Badge>
        </div>
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          Join {inviteDetails.tenantName}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          <strong>{inviteDetails.inviterName}</strong> has invited you to collaborate on Agentic
          Business OS.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Role & Permissions Banner */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Assigned Role
            </span>
            <Badge variant="default" className="font-mono text-xs font-semibold">
              <Shield className="w-3 h-3 mr-1" />
              {inviteDetails.roleCode}
            </Badge>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {roleDescriptions[inviteDetails.roleCode] || 'Authorized organization collaborator.'}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email (Readonly) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Your Email Address</Label>
            <Input
              value={inviteDetails.email}
              disabled
              className="bg-muted/50 font-mono text-xs text-muted-foreground cursor-not-allowed"
            />
          </div>

          {inviteDetails.isExistingUser ? (
            /* Existing User Callout */
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2">
              <p className="text-xs text-foreground leading-relaxed">
                You already have an active account associated with{' '}
                <strong>{inviteDetails.email}</strong>. Click below to accept and link your account
                to <strong>{inviteDetails.tenantName}</strong>.
              </p>
            </div>
          ) : (
            /* New User Registration Fields */
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs font-medium text-foreground">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    placeholder="e.g. Jane Doe"
                    disabled={isSubmitting}
                    className="pl-9 text-xs h-10"
                    {...register('fullName')}
                  />
                </div>
                {errors.fullName && (
                  <p className="text-[11px] text-destructive font-medium">
                    {errors.fullName.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-foreground">
                  Create Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 characters"
                    disabled={isSubmitting}
                    className="pl-9 pr-9 text-xs h-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-destructive font-medium">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-xs font-medium text-foreground">
                  Confirm Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repeat password"
                    disabled={isSubmitting}
                    className="pl-9 pr-9 text-xs h-10"
                    {...register('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-[11px] text-destructive font-medium">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full text-xs font-semibold h-10 mt-2 gap-2 cursor-pointer shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Joining {inviteDetails.tenantName}...
              </>
            ) : (
              <>
                {inviteDetails.isExistingUser
                  ? 'Accept Invitation & Join'
                  : 'Create Account & Join Team'}
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="pt-1 pb-4 flex justify-center text-center">
        <p className="text-[11px] text-muted-foreground">
          By joining, you agree to comply with your organization’s security policy and audit
          controls.
        </p>
      </CardFooter>
    </Card>
  );
}

export default function InvitePage() {
  return (
    <React.Suspense
      fallback={
        <Card className="max-w-md w-full mx-auto">
          <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground animate-pulse font-medium">
              Loading invitation...
            </p>
          </CardContent>
        </Card>
      }
    >
      <InviteContent />
    </React.Suspense>
  );
}
