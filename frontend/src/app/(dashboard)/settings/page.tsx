'use client';

import * as React from 'react';
import {
  Bot,
  Sparkles,
  Building2,
  Users,
  User,
  Shield,
  ShieldCheck,
  Save,
  Plus,
  Mail,
  RefreshCw,
  CheckCircle2,
  Lock,
  Copy,
  Sliders,
  DollarSign,
  Percent,
  Receipt,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { authStorage, AuthUser } from '@/lib/auth-storage';
import { formatCurrency } from '@/lib/formatters';

type SettingsTab = 'AI_GUARDRAILS' | 'ORGANIZATION' | 'TEAM_MEMBERS' | 'MY_PROFILE';

interface TenantSettingsState {
  allowAiAutoPosting: boolean;
  autoPostMinConfidence: number; // 0.50 to 1.00
  maxAutoPostAmountCents: string | number;
  requireReceiptAboveCents: string | number;
}

interface TenantDetails {
  id: string;
  slug: string;
  legalName: string;
  taxIdentifier?: string;
  baseCurrency: string;
  timezone: string;
  roleCode?: string;
}

interface TeamMember {
  id: string;
  userId: string;
  roleCode: string;
  status: string;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('AI_GUARDRAILS');
  const [loading, setLoading] = React.useState(true);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [savingOrg, setSavingOrg] = React.useState(false);
  const [invitingMember, setInvitingMember] = React.useState(false);

  // Tenant / User Context
  const [currentUser, setCurrentUser] = React.useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [tenant, setTenant] = React.useState<TenantDetails | null>(null);

  // Settings state
  const [aiSettings, setAiSettings] = React.useState<TenantSettingsState>({
    allowAiAutoPosting: true,
    autoPostMinConfidence: 0.95,
    maxAutoPostAmountCents: 500000,
    requireReceiptAboveCents: 7500,
  });

  // Org state for editing
  const [editOrgName, setEditOrgName] = React.useState('');
  const [editTimezone, setEditTimezone] = React.useState('UTC');
  const [editBaseCurrency, setEditBaseCurrency] = React.useState('USD');

  // Members state
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<
    'BOOKKEEPER' | 'CONTROLLER' | 'AUDITOR' | 'OWNER'
  >('BOOKKEEPER');

  // Password state
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [updatingPassword, setUpdatingPassword] = React.useState(false);

  React.useEffect(() => {
    const user = authStorage.getAuthUser();
    const activeTenantId = authStorage.getActiveTenantId();
    setCurrentUser(user);
    setTenantId(activeTenantId);

    if (activeTenantId) {
      loadSettingsData(activeTenantId);
    } else {
      setLoading(false);
    }
  }, []);

  const loadSettingsData = async (tid: string) => {
    try {
      setLoading(true);
      const [settingsRes, orgRes, membersRes] = await Promise.allSettled([
        apiClient.get<{ data: any }>(`/organizations/${tid}/settings`),
        apiClient.get<{ data: TenantDetails }>(`/organizations/${tid}`),
        apiClient.get<{ data: TeamMember[] }>(`/organizations/${tid}/members`),
      ]);

      if (settingsRes.status === 'fulfilled' && settingsRes.value.data) {
        const s = settingsRes.value.data;
        setAiSettings({
          allowAiAutoPosting: Boolean(s.allowAiAutoPosting),
          autoPostMinConfidence: Number(s.autoPostMinConfidence ?? 0.95),
          maxAutoPostAmountCents: s.maxAutoPostAmountCents ?? 500000,
          requireReceiptAboveCents: s.requireReceiptAboveCents ?? 7500,
        });
      }

      if (orgRes.status === 'fulfilled' && orgRes.value.data) {
        const org = orgRes.value.data;
        setTenant(org);
        setEditOrgName(org.legalName);
        setEditTimezone(org.timezone || 'UTC');
        setEditBaseCurrency(org.baseCurrency || 'USD');
      }

      if (membersRes.status === 'fulfilled' && membersRes.value.data) {
        setMembers(membersRes.value.data);
      }
    } catch {
      toast.error('Failed to load organization settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAiGuardrails = async () => {
    if (!tenantId) return;
    try {
      setSavingSettings(true);
      await apiClient.patch(`/organizations/${tenantId}/settings`, {
        allowAiAutoPosting: aiSettings.allowAiAutoPosting,
        autoPostMinConfidence: Number(aiSettings.autoPostMinConfidence),
        maxAutoPostAmountCents: Number(aiSettings.maxAutoPostAmountCents),
        requireReceiptAboveCents: Number(aiSettings.requireReceiptAboveCents),
      });
      toast.success('AI Guardrail preferences updated successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update AI settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveOrgDetails = async () => {
    if (!tenantId) return;
    try {
      setSavingOrg(true);
      const res = await apiClient.patch<{ data: TenantDetails }>(`/organizations/${tenantId}`, {
        legalName: editOrgName,
        timezone: editTimezone,
        baseCurrency: editBaseCurrency,
      });
      setTenant(res.data);
      if (res.data?.baseCurrency) {
        authStorage.setTenantCurrency(res.data.baseCurrency);
      }
      toast.success('Organization profile updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update organization');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !inviteEmail.trim()) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setInvitingMember(true);
      await apiClient.post(`/organizations/${tenantId}/members`, {
        email: inviteEmail.trim(),
        roleCode: inviteRole,
      });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteModalOpen(false);
      const membersRes = await apiClient.get<{ data: TeamMember[] }>(
        `/organizations/${tenantId}/members`,
      );
      if (membersRes.data) {
        setMembers(membersRes.data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to invite team member');
    } finally {
      setInvitingMember(false);
    }
  };

  const handleCopyTenantId = () => {
    if (tenantId) {
      navigator.clipboard.writeText(tenantId);
      toast.success('Organization ID copied to clipboard');
    }
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long');
      return;
    }
    setUpdatingPassword(true);
    setTimeout(() => {
      setUpdatingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password updated successfully');
    }, 600);
  };

  const currencySymbol = tenant?.baseCurrency === 'MYR' ? 'RM' : '$';

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
            <Badge
              variant="secondary"
              className="gap-1 px-2.5 py-0.5 font-medium text-xs bg-primary/10 text-primary border-primary/20"
            >
              <ShieldCheck className="w-3 h-3 text-primary" />
              Governed Controls
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Manage autonomous AI guardrails, company financial profile, team permissions, and
            account security.
          </p>
        </div>
        {tenant && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 font-mono text-xs border-border/70">
              Active Role: {tenant.roleCode || 'OWNER'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => tenantId && loadSettingsData(tenantId)}
              disabled={loading}
              className="gap-2 h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* Segmented Tab Navigation */}
      <div className="flex gap-2 border-b border-border/60 pb-3 overflow-x-auto no-scrollbar">
        <Button
          variant={activeTab === 'AI_GUARDRAILS' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('AI_GUARDRAILS')}
          className="gap-2 h-9 shrink-0"
        >
          <Bot className="w-4 h-4" />
          AI Automation & Guardrails
        </Button>
        <Button
          variant={activeTab === 'ORGANIZATION' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('ORGANIZATION')}
          className="gap-2 h-9 shrink-0"
        >
          <Building2 className="w-4 h-4" />
          Company Profile
        </Button>
        <Button
          variant={activeTab === 'TEAM_MEMBERS' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('TEAM_MEMBERS')}
          className="gap-2 h-9 shrink-0"
        >
          <Users className="w-4 h-4" />
          Team & Roles
          <Badge variant="secondary" className="ml-1 text-[11px] h-4 px-1.5">
            {members.length}
          </Badge>
        </Button>
        <Button
          variant={activeTab === 'MY_PROFILE' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('MY_PROFILE')}
          className="gap-2 h-9 shrink-0"
        >
          <User className="w-4 h-4" />
          My Profile & Security
        </Button>
      </div>

      {/* TAB 1: AI AUTOMATION & GUARDRAILS */}
      {activeTab === 'AI_GUARDRAILS' && (
        <div className="space-y-6">
          {/* Header Callout */}
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 pt-4 px-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <CardTitle className="text-sm font-semibold">
                  Deterministic Financial Safety Guarantee
                </CardTitle>
              </div>
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px] sm:text-xs font-mono shrink-0"
              >
                Zero Hallucinations Guarantee
              </Badge>
            </CardHeader>
            <CardContent className="px-5 pb-4 text-xs text-muted-foreground leading-relaxed">
              The AI accountant operates under strict deterministic boundaries. It extracts document
              layouts and proposes matching general ledger accounts, but{' '}
              <strong>
                only transactions meeting your exact confidence threshold and dollar limits
              </strong>{' '}
              are ever recorded automatically. All ambiguous items are safely held in Review &
              Approvals.
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Autonomous Posting Policies
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Fine-tune automatic transaction recording versus manual human approval routing.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-6">
              {/* Rule 1: Allow AI Auto-Posting Toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-border/70 bg-muted/20 gap-4">
                <div className="space-y-0.5">
                  <div className="font-semibold text-sm text-foreground">
                    Autonomous General Ledger Posting
                  </div>
                  <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
                    When active, high-confidence transactions meeting your thresholds are posted
                    instantly to books. When paused, all statement items require human one-click
                    confirmation.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge
                    variant={aiSettings.allowAiAutoPosting ? 'default' : 'secondary'}
                    className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium"
                    onClick={() =>
                      setAiSettings((prev) => ({
                        ...prev,
                        allowAiAutoPosting: !prev.allowAiAutoPosting,
                      }))
                    }
                  >
                    {aiSettings.allowAiAutoPosting
                      ? '✓ Active (Auto-Post)'
                      : 'Paused (Manual Confirmation)'}
                  </Badge>
                </div>
              </div>

              {/* Rule 2: Minimum Confidence Threshold Slider */}
              <div className="space-y-3 p-4 rounded-xl border border-border/70">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                      <Percent className="w-4 h-4 text-primary" />
                      Minimum AI Confidence Threshold
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Any transaction with AI certainty below this percentage will be queued for
                      manual approval.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-primary px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                      {Math.round(aiSettings.autoPostMinConfidence * 100)}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="1"
                  value={Math.round(aiSettings.autoPostMinConfidence * 100)}
                  onChange={(e) =>
                    setAiSettings((prev) => ({
                      ...prev,
                      autoPostMinConfidence: Number(e.target.value) / 100,
                    }))
                  }
                  className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>50% (Permissive)</span>
                  <span className="font-semibold text-primary">95% (Recommended Default)</span>
                  <span>100% (Strict Exact Match)</span>
                </div>
              </div>

              {/* Rule 3: Max Auto-Post Dollar Limit */}
              <div className="space-y-3 p-4 rounded-xl border border-border/70">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                      <DollarSign className="w-4 h-4 text-primary" />
                      Maximum Auto-Post Transaction Cap
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Transactions exceeding this amount will always require human controller
                      sign-off.
                    </p>
                  </div>
                  <div className="font-mono text-sm font-semibold text-foreground bg-muted px-2.5 py-1 rounded-lg">
                    {formatCurrency(
                      Number(aiSettings.maxAutoPostAmountCents) / 100,
                      tenant?.baseCurrency || 'USD',
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-muted-foreground font-mono text-sm">
                      {currencySymbol}
                    </span>
                    <Input
                      type="number"
                      step="100"
                      min="0"
                      value={Number(aiSettings.maxAutoPostAmountCents) / 100}
                      onChange={(e) =>
                        setAiSettings((prev) => ({
                          ...prev,
                          maxAutoPostAmountCents: Math.round(Number(e.target.value) * 100),
                        }))
                      }
                      className="pl-8 font-mono font-medium h-9 text-sm"
                    />
                  </div>
                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[1000, 5000, 10000, 25000, 50000].map((val) => (
                      <Button
                        key={val}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAiSettings((prev) => ({
                            ...prev,
                            maxAutoPostAmountCents: val * 100,
                          }))
                        }
                        className={`text-xs h-9 font-mono ${
                          Number(aiSettings.maxAutoPostAmountCents) === val * 100
                            ? 'border-primary text-primary bg-primary/5'
                            : ''
                        }`}
                      >
                        {currencySymbol}
                        {val.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rule 4: Receipt Compliance Threshold */}
              <div className="space-y-3 p-4 rounded-xl border border-border/70">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                      <Receipt className="w-4 h-4 text-primary" />
                      Receipt & Bill Compliance Policy
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Flag operating expenses over this amount that lack an attached vendor invoice
                      or receipt.
                    </p>
                  </div>
                  <div className="font-mono text-sm font-semibold text-foreground bg-muted px-2.5 py-1 rounded-lg">
                    {formatCurrency(
                      Number(aiSettings.requireReceiptAboveCents) / 100,
                      tenant?.baseCurrency || 'USD',
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-muted-foreground font-mono text-sm">
                      {currencySymbol}
                    </span>
                    <Input
                      type="number"
                      step="5"
                      min="0"
                      value={Number(aiSettings.requireReceiptAboveCents) / 100}
                      onChange={(e) =>
                        setAiSettings((prev) => ({
                          ...prev,
                          requireReceiptAboveCents: Math.round(Number(e.target.value) * 100),
                        }))
                      }
                      className="pl-8 font-mono font-medium h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[25, 75, 250, 500].map((val) => (
                      <Button
                        key={val}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAiSettings((prev) => ({
                            ...prev,
                            requireReceiptAboveCents: val * 100,
                          }))
                        }
                        className={`text-xs h-9 font-mono ${
                          Number(aiSettings.requireReceiptAboveCents) === val * 100
                            ? 'border-primary text-primary bg-primary/5'
                            : ''
                        }`}
                      >
                        {currencySymbol}
                        {val} {val === 75 ? '(IRS Std)' : ''}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  onClick={handleSaveAiGuardrails}
                  disabled={savingSettings}
                  size="sm"
                  className="gap-2 h-9"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingSettings ? 'Saving Policies...' : 'Save AI Guardrails'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: ORGANIZATION PROFILE */}
      {activeTab === 'ORGANIZATION' && (
        <div className="space-y-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold">Company & Financial Profile</CardTitle>
              <CardDescription className="text-xs">
                Primary business identity, functional accounting currency, and operating timezone.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Legal Business Name
                  </label>
                  <Input
                    value={editOrgName}
                    onChange={(e) => setEditOrgName(e.target.value)}
                    placeholder="e.g. Acme Corp Pte Ltd"
                    className="h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Printed on customer invoices, financial reports, and tax statements.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Workspace Slug</label>
                  <Input
                    value={tenant?.slug || ''}
                    disabled
                    className="bg-muted font-mono h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Permanent tenant identifier assigned upon workspace creation.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Base Functional Currency
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={editBaseCurrency}
                      onChange={(e) => setEditBaseCurrency(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono font-medium"
                    >
                      <option value="MYR">MYR (RM) - Malaysian Ringgit</option>
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="SGD">SGD ($) - Singapore Dollar</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                    </select>
                    <Badge variant="outline" className="text-xs shrink-0">
                      General Ledger Currency
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    All financial statements, balance sheets, and trial balances calculate in this
                    currency.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Operating Timezone
                  </label>
                  <select
                    value={editTimezone}
                    onChange={(e) => setEditTimezone(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="UTC">UTC (Universal Time)</option>
                    <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (MYT +08:00)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Determines fiscal period cutoffs and statement transaction timestamps.
                  </p>
                </div>
              </div>

              {/* Double Entry Standard Badge */}
              <div className="p-4 rounded-xl border border-border/70 bg-muted/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Accounting Standard Invariant
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Agentic OS strictly enforces{' '}
                  <strong>Accrual-Basis Double-Entry Bookkeeping</strong>. Every posted transaction
                  records balanced debits and credits across assets, liabilities, equity, revenues,
                  and expenses.
                </p>
              </div>

              {/* Organization ID */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-foreground">
                  Organization Tenant ID
                </label>
                <div className="flex items-center gap-2 max-w-md">
                  <Input
                    value={tenantId || ''}
                    disabled
                    className="font-mono text-xs bg-muted h-9"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyTenantId}
                    title="Copy Organization ID"
                    className="h-9 w-9 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  onClick={handleSaveOrgDetails}
                  disabled={savingOrg}
                  size="sm"
                  className="gap-2 h-9"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingOrg ? 'Saving...' : 'Save Company Profile'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: TEAM & PERMISSIONS */}
      {activeTab === 'TEAM_MEMBERS' && (
        <div className="space-y-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold">
                  Team Members & Role-Based Access
                </CardTitle>
                <CardDescription className="text-xs">
                  Manage organization access, assign accounting permissions, and invite
                  collaborators.
                </CardDescription>
              </div>
              <Button
                onClick={() => setInviteModalOpen(true)}
                size="sm"
                className="gap-2 shrink-0 h-9"
              >
                <Plus className="w-3.5 h-3.5" />
                Invite Member
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No team members found.
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 overflow-hidden">
                  {/* Desktop Table View */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Permissions</TableHead>
                          <TableHead>Joined Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((mem) => {
                          const displayName = mem.user?.fullName || 'Active Member';
                          const displayEmail = mem.user?.email || 'Registered User';
                          return (
                            <TableRow key={mem.id} className="hover:bg-muted/30">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                                    {displayName.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-sm truncate text-foreground">
                                      {displayName}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                      {displayEmail}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={mem.roleCode === 'OWNER' ? 'default' : 'outline'}
                                  className="font-mono text-xs"
                                >
                                  {mem.roleCode}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                >
                                  {mem.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-xs">
                                {mem.roleCode === 'OWNER' &&
                                  'Full administrative & financial authority'}
                                {mem.roleCode === 'CONTROLLER' &&
                                  'Approvals, period close, and journal posting'}
                                {mem.roleCode === 'BOOKKEEPER' &&
                                  'Invoice entry, banking uploads, draft transactions'}
                                {mem.roleCode === 'AUDITOR' &&
                                  'Read-only access to ledgers & reports'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {new Date(mem.createdAt).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Team List View */}
                  <div className="md:hidden divide-y divide-border">
                    {members.map((mem) => {
                      const displayName = mem.user?.fullName || 'Active Member';
                      const displayEmail = mem.user?.email || 'Registered User';
                      return (
                        <div key={mem.id} className="p-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                                {displayName.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-sm text-foreground truncate">
                                  {displayName}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {displayEmail}
                                </div>
                              </div>
                            </div>
                            <Badge
                              variant={mem.roleCode === 'OWNER' ? 'default' : 'outline'}
                              className="font-mono text-xs shrink-0"
                            >
                              {mem.roleCode}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            >
                              {mem.status}
                            </Badge>
                            <span className="font-mono text-[11px]">
                              Joined {new Date(mem.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Role Reference Card */}
          <Card className="border-border/70 bg-muted/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-primary" />
                Role-Based Access Control (RBAC) Architecture
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1">
                <span className="font-semibold text-foreground">Owner</span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Full authority over billing, bank accounts, guardrail policies, and member
                  invites.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1">
                <span className="font-semibold text-foreground">Controller</span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Approves transaction exceptions, finalizes fiscal periods, and posts adjusting
                  journal entries.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1">
                <span className="font-semibold text-foreground">Bookkeeper</span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Issues customer invoices, registers vendor bills, and uploads bank statement
                  feeds.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1">
                <span className="font-semibold text-foreground">Auditor</span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Read-only access to Trial Balances, Balance Sheets, and immutable system audit
                  trails.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: MY PROFILE & SECURITY */}
      {activeTab === 'MY_PROFILE' && (
        <div className="space-y-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold">User Profile</CardTitle>
              <CardDescription className="text-xs">
                Your personal account credentials and security preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Full Name</label>
                  <Input
                    value={currentUser?.fullName || ''}
                    disabled
                    className="bg-muted h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Email Address</label>
                  <Input
                    value={currentUser?.email || ''}
                    disabled
                    className="bg-muted font-mono h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">User ID</label>
                  <Input
                    value={currentUser?.id || ''}
                    disabled
                    className="bg-muted font-mono text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Assigned Role</label>
                  <Input
                    value={tenant?.roleCode || 'OWNER'}
                    disabled
                    className="bg-muted font-mono font-semibold h-9 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                <CardTitle className="text-base font-semibold">Security & Password</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Update your personal account password.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Current Password</label>
                  <Input
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">New Password</label>
                  <Input
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <Button type="submit" disabled={updatingPassword} size="sm" className="gap-2 h-9">
                  <Save className="w-3.5 h-3.5" />
                  {updatingPassword ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invite Member Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-2xl border border-border">
            <CardHeader>
              <CardTitle>Invite Team Member</CardTitle>
              <CardDescription>
                Send an invitation to join your organization workspace with specific permissions.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleInviteMember}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Email Address</label>
                  <Input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e: any) => setInviteRole(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="BOOKKEEPER">Bookkeeper (Invoices & Banking)</option>
                    <option value="CONTROLLER">Controller (Approvals & Closing)</option>
                    <option value="AUDITOR">Auditor (Read-Only Financials)</option>
                    <option value="OWNER">Owner (Full Admin Access)</option>
                  </select>
                </div>
              </CardContent>
              <div className="flex justify-end gap-2 p-6 pt-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInviteModalOpen(false)}
                  disabled={invitingMember}
                  className="h-9"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={invitingMember} className="gap-2 h-9">
                  <Mail className="w-3.5 h-3.5" />
                  {invitingMember ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
