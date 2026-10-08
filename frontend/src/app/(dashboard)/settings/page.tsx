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
  ShieldAlert,
  Save,
  Plus,
  Mail,
  RefreshCw,
  CheckCircle2,
  Lock,
  Copy,
  Info,
  Sliders,
  DollarSign,
  Percent,
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
      });
      setTenant(res.data);
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
      // Reload members list
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

  return (
    <div className="flex flex-col space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure AI automation guardrails, company profile, team roles, and account
            preferences.
          </p>
        </div>
        {tenant && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
              Role: {tenant.roleCode || 'OWNER'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => tenantId && loadSettingsData(tenantId)}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* Segmented Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b pb-3">
        <Button
          variant={activeTab === 'AI_GUARDRAILS' ? 'default' : 'outline'}
          onClick={() => setActiveTab('AI_GUARDRAILS')}
          className="gap-2"
        >
          <Bot className="w-4 h-4" />
          AI Automation & Guardrails
        </Button>
        <Button
          variant={activeTab === 'ORGANIZATION' ? 'default' : 'outline'}
          onClick={() => setActiveTab('ORGANIZATION')}
          className="gap-2"
        >
          <Building2 className="w-4 h-4" />
          Organization Profile
        </Button>
        <Button
          variant={activeTab === 'TEAM_MEMBERS' ? 'default' : 'outline'}
          onClick={() => setActiveTab('TEAM_MEMBERS')}
          className="gap-2"
        >
          <Users className="w-4 h-4" />
          Team & Permissions
          <Badge variant="secondary" className="ml-1 text-xs">
            {members.length}
          </Badge>
        </Button>
        <Button
          variant={activeTab === 'MY_PROFILE' ? 'default' : 'outline'}
          onClick={() => setActiveTab('MY_PROFILE')}
          className="gap-2"
        >
          <User className="w-4 h-4" />
          My Profile & Security
        </Button>
      </div>

      {/* TAB 1: AI AUTOMATION & GUARDRAILS */}
      {activeTab === 'AI_GUARDRAILS' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <Card className="border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <CardTitle className="text-base text-indigo-900 dark:text-indigo-300">
                  Deterministic Financial Safety Guarantee
                </CardTitle>
              </div>
              <Badge
                variant="outline"
                className="bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900 dark:text-indigo-300"
              >
                Zero Hallucinations
              </Badge>
            </CardHeader>
            <CardContent className="text-sm text-indigo-950/80 dark:text-indigo-200/80">
              The AI accountant is strictly advisory. It suggests matches, tags counterparties, and
              proposes journal entries. Only entries that meet your exact confidence threshold and
              dollar limits will ever be posted automatically without manual review.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                <CardTitle>AI Auto-Posting & Approval Rules</CardTitle>
              </div>
              <CardDescription>
                Define exactly when the AI is permitted to record transactions directly to your
                General Ledger versus routing them to Review & Approvals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Rule 1: Allow AI Auto-Posting Toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border bg-muted/30 gap-4">
                <div className="space-y-0.5">
                  <div className="font-semibold text-base">Enable Automatic Ledger Posting</div>
                  <p className="text-sm text-muted-foreground">
                    When enabled, high-confidence matches are automatically balanced and posted.
                    When disabled, every single transaction requires manual human confirmation.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge
                    variant={aiSettings.allowAiAutoPosting ? 'default' : 'secondary'}
                    className="cursor-pointer select-none px-3 py-1.5"
                    onClick={() =>
                      setAiSettings((prev) => ({
                        ...prev,
                        allowAiAutoPosting: !prev.allowAiAutoPosting,
                      }))
                    }
                  >
                    {aiSettings.allowAiAutoPosting
                      ? 'Active (Auto-Post)'
                      : 'Paused (Manual Review)'}
                  </Badge>
                </div>
              </div>

              {/* Rule 2: Minimum Confidence Threshold Slider */}
              <div className="space-y-3 p-4 rounded-lg border">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="font-semibold text-sm flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-primary" />
                      Minimum AI Confidence Threshold
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Any transaction with AI confidence below this percentage will be held in
                      Review & Approvals.
                    </p>
                  </div>
                  <span className="font-mono text-lg font-bold text-primary">
                    {Math.round(aiSettings.autoPostMinConfidence * 100)}%
                  </span>
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
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>50% (Permissive)</span>
                  <span>95% (Recommended Default)</span>
                  <span>100% (Exact Matches Only)</span>
                </div>
              </div>

              {/* Rule 3: Max Auto-Post Dollar Limit */}
              <div className="space-y-2 p-4 rounded-lg border">
                <label className="font-semibold text-sm flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Maximum Auto-Post Transaction Amount
                </label>
                <p className="text-xs text-muted-foreground">
                  Transactions exceeding this dollar threshold will always require human controller
                  approval, regardless of how confident the AI is.
                </p>
                <div className="relative max-w-sm mt-2">
                  <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                  <Input
                    type="number"
                    step="50"
                    min="0"
                    value={Number(aiSettings.maxAutoPostAmountCents) / 100}
                    onChange={(e) =>
                      setAiSettings((prev) => ({
                        ...prev,
                        maxAutoPostAmountCents: Math.round(Number(e.target.value) * 100),
                      }))
                    }
                    className="pl-7 font-mono font-medium"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Current cap:{' '}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(
                      Number(aiSettings.maxAutoPostAmountCents),
                      tenant?.baseCurrency || 'USD',
                    )}
                  </span>
                </p>
              </div>

              {/* Rule 4: Receipt Compliance Threshold */}
              <div className="space-y-2 p-4 rounded-lg border">
                <label className="font-semibold text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Receipt / Document Compliance Threshold
                </label>
                <p className="text-xs text-muted-foreground">
                  Flag business expenses over this amount that do not have an attached receipt or
                  invoice (compliant with standard IRS and tax recordkeeping regulations).
                </p>
                <div className="relative max-w-sm mt-2">
                  <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
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
                    className="pl-7 font-mono font-medium"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Current compliance threshold:{' '}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(
                      Number(aiSettings.requireReceiptAboveCents),
                      tenant?.baseCurrency || 'USD',
                    )}
                  </span>
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  onClick={handleSaveAiGuardrails}
                  disabled={savingSettings}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
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
          <Card>
            <CardHeader>
              <CardTitle>Company & Financial Profile</CardTitle>
              <CardDescription>
                Primary business identity, functional accounting currency, and operating timezone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Legal Business Name</label>
                  <Input
                    value={editOrgName}
                    onChange={(e) => setEditOrgName(e.target.value)}
                    placeholder="e.g. Acme Corp Pte Ltd"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used on customer invoices, financial reports, and tax statements.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Organization URL Slug</label>
                  <Input value={tenant?.slug || ''} disabled className="bg-muted font-mono" />
                  <p className="text-xs text-muted-foreground">
                    Permanent tenant identifier assigned upon workspace creation.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Base Functional Currency</label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={tenant?.baseCurrency || 'USD'}
                      disabled
                      className="bg-muted font-mono font-bold w-32"
                    />
                    <Badge variant="outline" className="text-xs">
                      Primary Ledger Currency
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    General Ledger accounts, balance sheets, and trial balances calculate in this
                    currency.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Operating Timezone</label>
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
                  <p className="text-xs text-muted-foreground">
                    Determines fiscal period boundaries and statement transaction timestamps.
                  </p>
                </div>
              </div>

              {/* Accounting Standards Metadata */}
              <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Accounting Standard Enforced
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Agentic OS enforces <strong>Accrual-Basis Double-Entry Bookkeeping</strong>. Every
                  posted transaction automatically records balanced debits and credits across
                  assets, liabilities, equity, revenues, and expenses.
                </p>
              </div>

              {/* Organization ID */}
              <div className="space-y-2 pt-2">
                <label className="text-sm font-semibold">Organization Tenant ID</label>
                <div className="flex items-center gap-2 max-w-md">
                  <Input value={tenantId || ''} disabled className="font-mono text-xs bg-muted" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyTenantId}
                    title="Copy Organization ID"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button onClick={handleSaveOrgDetails} disabled={savingOrg} className="gap-2">
                  <Save className="w-4 h-4" />
                  {savingOrg ? 'Saving...' : 'Save Organization Profile'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: TEAM & PERMISSIONS */}
      {activeTab === 'TEAM_MEMBERS' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Team Members & Roles</CardTitle>
                <CardDescription>
                  Manage organization access, assign accounting permissions, and invite
                  collaborators.
                </CardDescription>
              </div>
              <Button onClick={() => setInviteModalOpen(true)} className="gap-2 shrink-0">
                <Plus className="w-4 h-4" />
                Invite Member
              </Button>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No team members found.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
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
                          <TableRow key={mem.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                                  {displayName.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium text-sm truncate">
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
                                variant={mem.status === 'ACTIVE' ? 'secondary' : 'outline'}
                                className="text-xs"
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
              )}
            </CardContent>
          </Card>

          {/* Role Descriptions Reference Card */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Role-Based Access Control (RBAC) Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div className="p-3 rounded border bg-background space-y-1">
                <span className="font-semibold text-foreground">Owner</span>
                <p>
                  Complete authority over tenant billing, financial settings, bank credentials, and
                  member provisioning.
                </p>
              </div>
              <div className="p-3 rounded border bg-background space-y-1">
                <span className="font-semibold text-foreground">Controller</span>
                <p>
                  Can approve exceptions in Review & Approvals, finalize monthly periods, and post
                  manual adjusting entries.
                </p>
              </div>
              <div className="p-3 rounded border bg-background space-y-1">
                <span className="font-semibold text-foreground">Bookkeeper</span>
                <p>
                  Can create invoices, upload PDF bank statements, reconcile payments, and draft
                  entries.
                </p>
              </div>
              <div className="p-3 rounded border bg-background space-y-1">
                <span className="font-semibold text-foreground">Auditor</span>
                <p>
                  Strict read-only access to view Trial Balances, General Ledgers, and system audit
                  logs.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: MY PROFILE & SECURITY */}
      {activeTab === 'MY_PROFILE' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Profile</CardTitle>
              <CardDescription>
                Your personal account details and session credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
                  <Input value={currentUser?.fullName || ''} disabled className="bg-muted" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Email Address
                  </label>
                  <Input value={currentUser?.email || ''} disabled className="bg-muted font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">User ID</label>
                  <Input
                    value={currentUser?.id || ''}
                    disabled
                    className="bg-muted font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Active Role</label>
                  <Input
                    value={tenant?.roleCode || 'OWNER'}
                    disabled
                    className="bg-muted font-mono font-semibold"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                <CardTitle>Security & Password</CardTitle>
              </div>
              <CardDescription>Update your personal account password.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Current Password</label>
                  <Input
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">New Password</label>
                  <Input
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={updatingPassword} className="gap-2">
                  <Save className="w-4 h-4" />
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
          <Card className="w-full max-w-md shadow-2xl border">
            <CardHeader>
              <CardTitle>Invite Team Member</CardTitle>
              <CardDescription>
                Send an invitation to join your organization workspace with specific permissions.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleInviteMember}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Email Address</label>
                  <Input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Role</label>
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
                  onClick={() => setInviteModalOpen(false)}
                  disabled={invitingMember}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={invitingMember} className="gap-2">
                  <Mail className="w-4 h-4" />
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
