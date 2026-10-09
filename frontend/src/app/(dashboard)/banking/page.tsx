'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  Building2,
  CheckCircle2,
  Clock,
  MoreVertical,
  Loader2,
  AlertCircle,
  Plus,
  FileText,
  ArrowRight,
  RefreshCw,
  Landmark,
  Sparkles,
  ShieldCheck,
  Check,
  CreditCard,
  Wallet,
  FileCheck2,
  RotateCcw,
  ExternalLink,
  HelpCircle,
  FileDown,
  X,
  Layers,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatIsoDate } from '@/lib/formatters';
import { useTenantCurrency } from '@/hooks/use-tenant-currency';

interface BankAccount {
  id: string;
  tenantId: string;
  ledgerAccountId: string;
  accountName: string;
  institutionName: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD';
  currency: string;
  accountNumberLast4: string;
  currentBalanceCents: string | number;
  reconciledBalanceCents: string | number;
  isActive: boolean;
  createdAt: string;
}

interface LedgerAccount {
  id: string;
  accountCode: string;
  name: string;
  classification: string;
  subClassification: string;
}

interface UploadResult {
  statement: {
    id: string;
    fileName: string;
    fileSha256: string;
    status: string;
    createdAt: string;
  };
  transactions: Array<{
    id: string;
    transactionDate: string;
    amountCents: string | number;
    rawDescription: string;
    status: string;
  }>;
  proposals: Array<{
    id: string;
    proposalType: string;
    confidenceScore: number;
    status: string;
  }>;
  exceptions: Array<{
    id: string;
    exceptionType: string;
    severity: string;
    reason: string;
  }>;
}

interface BankStatementRecord {
  id: string;
  fileName: string;
  bankAccountId?: string | null;
  statementStartDate?: string;
  statementEndDate?: string;
  openingBalanceCents?: string | number;
  closingBalanceCents?: string | number;
  totalDebitsCents?: string | number;
  totalCreditsCents?: string | number;
  bankDetected?: string;
  status:
    'UPLOADED' | 'PROCESSING' | 'PARSED' | 'RECONCILED' | 'FAILED' | 'EXCEPTION' | 'NEEDS_REVIEW';
  errorMessage?: string;
  createdAt: string;
}

interface BatchQueueItem {
  id: string;
  file?: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status:
    | 'QUEUED'
    | 'UPLOADING'
    | 'EXTRACTING'
    | 'VALIDATING'
    | 'CATEGORIZING'
    | 'RECONCILING'
    | 'COMPLETED'
    | 'FAILED';
  stageName: string;
  progress: number;
  step: number;
  jobId?: string;
  statementId?: string;
  transactionsCount?: number;
  errorMessage?: string;
  result?: UploadResult | null;
  startedAt: number;
  completedAt?: number;
}

const BATCH_QUEUE_STORAGE_KEY = 'agentic_os_active_batch_queue';

export default function BankingPage() {
  const [accounts, setAccounts] = React.useState<BankAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = React.useState(true);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>('');

  // Statements History State
  const [statements, setStatements] = React.useState<BankStatementRecord[]>([]);
  const [isLoadingStatements, setIsLoadingStatements] = React.useState(true);
  const [retryingId, setRetryingId] = React.useState<string | null>(null);

  // Account Creation Form State
  const [isAddingAccount, setIsAddingAccount] = React.useState(false);
  const [isSubmittingAccount, setIsSubmittingAccount] = React.useState(false);
  const [newAccountName, setNewAccountName] = React.useState('Primary Operating Checking');
  const [newInstitution, setNewInstitution] = React.useState('Mercury Bank');
  const [newAccountType, setNewAccountType] = React.useState<
    'CHECKING' | 'SAVINGS' | 'CREDIT_CARD'
  >('CHECKING');
  const tenantCurrency = useTenantCurrency();
  const [newLast4, setNewLast4] = React.useState('4092');
  const [newCurrency, setNewCurrency] = React.useState('MYR');

  React.useEffect(() => {
    if (tenantCurrency) {
      setNewCurrency(tenantCurrency);
    }
  }, [tenantCurrency]);

  // Manual Bank Selection for Upload
  const [manualBankName, setManualBankName] = React.useState('');
  const [manualAccountType, setManualAccountType] = React.useState<
    'CHECKING' | 'SAVINGS' | 'CREDIT_CARD'
  >('CHECKING');
  const [manualLast4, setManualLast4] = React.useState('');

  // Multi-File Batch Upload Queue State
  const [isDragging, setIsDragging] = React.useState(false);
  const [batchQueue, setBatchQueue] = React.useState<BatchQueueItem[]>([]);
  const inFlightIdsRef = React.useRef<Set<string>>(new Set());
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadAccounts = React.useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const response = await apiClient.get<{ data: BankAccount[] }>('/banking/accounts');
      const list = response.data || [];
      setAccounts(list);
    } catch (err) {
      console.error('Failed to load bank accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  const loadStatements = React.useCallback(async () => {
    setIsLoadingStatements(true);
    try {
      const response = await apiClient.get<{ data: BankStatementRecord[] }>('/banking/statements');
      setStatements(response.data || []);
    } catch (err) {
      console.error('Failed to load bank statements:', err);
    } finally {
      setIsLoadingStatements(false);
    }
  }, []);

  // Individual Queue Item Worker (Unified Object Storage & Background Queue)
  const processQueueItem = React.useCallback(
    async (item: BatchQueueItem) => {
      if (inFlightIdsRef.current.has(item.id)) return;
      inFlightIdsRef.current.add(item.id);

      const targetAccountId = selectedAccountId || undefined;

      const updateItem = (updater: Partial<BatchQueueItem>) => {
        setBatchQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, ...updater } : q)));
      };

      try {
        updateItem({
          status: 'UPLOADING',
          stageName: 'Uploading to secure object storage...',
          progress: 15,
          step: 1,
        });

        if (!item.file) {
          throw new Error(
            'File object is no longer available in memory. Please select the file again.',
          );
        }

        const isPdf = item.fileName.endsWith('.pdf') || item.mimeType.includes('pdf');
        const mimeType = isPdf ? ('application/pdf' as const) : ('text/csv' as const);

        // 1. Request presigned upload URL from backend (S3 in production, Local Storage in development)
        const presignedRes = await apiClient.post<{ data: { url: string; objectKey: string } }>(
          '/banking/statements/presigned-url',
          {
            fileName: item.fileName,
            mimeType,
          },
        );
        const { url, objectKey } = presignedRes.data;

        updateItem({ progress: 30 });

        // 2. Stream binary directly to Object Storage (0 server memory overhead)
        const uploadRes = await fetch(url, {
          method: 'PUT',
          body: item.file,
          headers: { 'Content-Type': mimeType },
        });

        if (!uploadRes.ok) {
          throw new Error(`Object storage upload failed with status ${uploadRes.status}`);
        }

        updateItem({
          status: 'EXTRACTING',
          stageName: 'Reading document layout & tables...',
          progress: 45,
          step: 2,
        });

        // 3. Queue background parsing & reconciliation
        const payload: any = {
          fileName: item.fileName,
          mimeType,
          objectKey,
        };
        if (targetAccountId && targetAccountId !== 'NEW_MANUAL') {
          payload.bankAccountId = targetAccountId;
        } else if (targetAccountId === 'NEW_MANUAL') {
          payload.manualBankName = manualBankName.trim();
          payload.manualAccountType = manualAccountType;
          payload.manualAccountNumberLast4 = manualLast4.trim();
        }

        const queueRes = await apiClient.post<{ data: { jobId: string; status: string } }>(
          '/banking/statements/queue-upload',
          payload,
        );

        const jobId = queueRes.data.jobId;
        updateItem({ jobId });

        // 4. Poll & stream job status from BullMQ with database fallback
        let attempts = 0;
        let completed = false;

        while (attempts < 120 && !completed) {
          attempts++;
          try {
            const statusRes = await apiClient.get<{
              data: {
                id: string;
                state: string;
                result: UploadResult | null;
                failedReason?: string;
                progress?:
                  { percent?: number; stage?: string; step?: number; message?: string } | number;
              };
            }>(`/banking/statements/jobs/${jobId}?fileName=${encodeURIComponent(item.fileName)}`, {
              silent: true,
            });

            const { state, result, failedReason, progress } = statusRes.data;

            if (progress && typeof progress === 'object') {
              if (progress.stage === 'DOWNLOADING' || progress.stage === 'EXTRACTING') {
                updateItem({
                  status: 'EXTRACTING',
                  stageName: 'Reading document layout & tables...',
                  step: 1,
                  progress: progress.percent || 35,
                });
              } else if (progress.stage === 'VALIDATING') {
                updateItem({
                  status: 'VALIDATING',
                  stageName: 'Verifying numbers & checksums...',
                  step: 2,
                  progress: progress.percent || 55,
                });
              } else if (progress.stage === 'CATEGORIZING') {
                updateItem({
                  status: 'CATEGORIZING',
                  stageName: 'Auto-categorizing payees & proposals...',
                  step: 3,
                  progress: progress.percent || 75,
                });
              } else if (progress.stage === 'RECONCILING') {
                updateItem({
                  status: 'RECONCILING',
                  stageName: 'Reconciling general ledger...',
                  step: 4,
                  progress: progress.percent || 95,
                });
              }
            }

            if (state === 'completed' && result) {
              updateItem({
                status: 'COMPLETED',
                stageName: 'Reconciled',
                progress: 100,
                step: 4,
                statementId: result.statement?.id,
                transactionsCount: result.transactions?.length || 0,
                result,
                completedAt: Date.now(),
              });
              loadAccounts();
              loadStatements();
              toast.success(`Statement "${item.fileName}" reconciled successfully!`);
              completed = true;
              break;
            } else if (state === 'failed') {
              updateItem({
                status: 'FAILED',
                stageName: 'Failed',
                progress: 100,
                errorMessage: failedReason || 'Processing failed',
              });
              loadStatements();
              toast.error(`"${item.fileName}": ${failedReason || 'Statement parsing failed'}`);
              completed = true;
              break;
            } else if (state === 'active') {
              updateItem({
                status: 'VALIDATING',
                stageName: 'Processing & reconciling...',
                step: 2,
              });
            } else if (state === 'not_found') {
              // Fallback to database check
              const statementsRes = await apiClient.get<{ data: BankStatementRecord[] }>(
                '/banking/statements',
                { silent: true },
              );
              const list = statementsRes.data || [];
              const match = list.find((s) => s.fileName === item.fileName);
              if (match && (match.status === 'PARSED' || match.status === 'RECONCILED')) {
                updateItem({
                  status: 'COMPLETED',
                  stageName: 'Reconciled',
                  progress: 100,
                  step: 4,
                  completedAt: Date.now(),
                });
                toast.success(`Statement "${item.fileName}" completed!`);
              } else {
                updateItem({
                  status: 'FAILED',
                  stageName: 'Failed',
                  progress: 100,
                  errorMessage: 'Statement processing timed out or failed',
                });
              }
              loadStatements();
              loadAccounts();
              completed = true;
              break;
            }
          } catch (pollErr: any) {
            console.warn('Queue item poll retry:', pollErr);
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (err: any) {
        const errorMsg = err?.data?.message || err?.message || 'Upload processing failed';
        updateItem({
          status: 'FAILED',
          stageName: 'Failed',
          progress: 100,
          errorMessage: errorMsg,
        });
        loadStatements();
        toast.error(`"${item.fileName}": ${errorMsg}`);
      } finally {
        inFlightIdsRef.current.delete(item.id);
      }
    },
    [
      selectedAccountId,
      manualBankName,
      manualAccountType,
      manualLast4,
      loadAccounts,
      loadStatements,
    ],
  );

  // Queue Dispatcher Effect (Sequential Batch Queue Dispatcher, Concurrency = 1)
  React.useEffect(() => {
    const queuedItems = batchQueue.filter((item) => item.status === 'QUEUED');
    const runningCount = batchQueue.filter(
      (item) =>
        item.status === 'UPLOADING' ||
        item.status === 'EXTRACTING' ||
        item.status === 'VALIDATING' ||
        item.status === 'CATEGORIZING' ||
        item.status === 'RECONCILING',
    ).length;

    if (runningCount === 0 && queuedItems.length > 0) {
      const nextItem = queuedItems[0];
      if (nextItem) {
        processQueueItem(nextItem);
      }
    }
  }, [batchQueue, processQueueItem]);

  // Tab visibility and window focus listener for instant resyncing
  React.useEffect(() => {
    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') {
        loadAccounts();
        loadStatements();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('focus', handleVisibilitySync);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('focus', handleVisibilitySync);
    };
  }, [loadAccounts, loadStatements]);

  // Initial load on mount
  React.useEffect(() => {
    loadAccounts();
    loadStatements();
  }, [loadAccounts, loadStatements]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAccount(true);

    try {
      let ledgerRes = await apiClient.get<{ data: LedgerAccount[] }>('/ledger/accounts');
      let ledgerAccounts = ledgerRes.data || [];

      if (ledgerAccounts.length === 0) {
        const seeded = await apiClient.post<{ data: LedgerAccount[] }>(
          '/ledger/accounts/seed-standard',
          {},
        );
        ledgerAccounts = seeded.data || [];
      }

      const cashAccount =
        ledgerAccounts.find(
          (acc) => acc.accountCode === '1010' || acc.subClassification === 'CASH',
        ) || ledgerAccounts[0];

      if (!cashAccount) {
        throw new Error('Unable to locate cash account in Chart of Accounts.');
      }

      const res = await apiClient.post<{ data: BankAccount }>('/banking/accounts', {
        ledgerAccountId: cashAccount.id,
        accountName: newAccountName.trim(),
        institutionName: newInstitution.trim(),
        accountType: newAccountType,
        currency: newCurrency,
        accountNumberLast4: newLast4.trim(),
      });

      const created = res.data;
      setAccounts((prev) => [created, ...prev]);
      setSelectedAccountId(created.id);
      setIsAddingAccount(false);
      toast.success('Bank account connected successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save bank account');
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const handleFilesProcess = (files: FileList | File[]) => {
    const fileList = Array.from(files);
    const validFiles = fileList.filter(
      (f) =>
        f.name.endsWith('.pdf') ||
        f.name.endsWith('.csv') ||
        f.type.includes('pdf') ||
        f.type.includes('csv'),
    );

    if (validFiles.length === 0) {
      toast.error('Please select valid .PDF or .CSV statement files.');
      return;
    }

    const newItems: BatchQueueItem[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      file,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.name.endsWith('.pdf') ? 'application/pdf' : 'text/csv',
      status: 'QUEUED',
      stageName: 'Queued in batch...',
      progress: 0,
      step: 1,
      startedAt: Date.now(),
    }));

    setBatchQueue((prev) => [...newItems, ...prev]);
    toast.info(
      `Added ${validFiles.length} statement${validFiles.length > 1 ? 's' : ''} to upload queue`,
    );
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesProcess(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesProcess(e.dataTransfer.files);
    }
  };

  const triggerUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleClearCompleted = () => {
    setBatchQueue((prev) => prev.filter((item) => item.status !== 'COMPLETED'));
  };

  const handleRemoveQueueItem = (id: string) => {
    inFlightIdsRef.current.delete(id);
    setBatchQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRetryStatement = async (statementId: string) => {
    setRetryingId(statementId);
    try {
      await apiClient.post(`/banking/statements/${statementId}/retry`, {});
      toast.success('Statement re-queued for processing');
      loadStatements();
      loadAccounts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to retry statement');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">Bank Accounts & Statements</h1>
            <Badge
              variant="secondary"
              className="gap-1 px-2.5 py-0.5 font-medium text-xs bg-primary/10 text-primary border-primary/20"
            >
              <Landmark className="w-3 h-3 text-primary" />
              Connected Vault
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Connect bank accounts and import statements for automated reconciliation and zero-touch
            bookkeeping.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadAccounts();
              loadStatements();
            }}
            disabled={isLoadingAccounts || isLoadingStatements}
            className="h-9"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-2 ${
                isLoadingAccounts || isLoadingStatements ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsAddingAccount((prev) => !prev)} className="h-9">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {isAddingAccount ? 'Cancel' : 'Connect Account'}
          </Button>
        </div>
      </div>

      {/* Add Account Inline Form */}
      {isAddingAccount && (
        <Card className="border-primary/30 bg-primary/5 shadow-sm animate-in fade-in duration-200">
          <CardHeader className="pb-3 border-b border-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Connect New Bank Account</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Register a checking or credit account connected to your General Ledger Cash
                  account (1010).
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="text-xs bg-primary/10 border-primary/20 text-primary"
              >
                Direct Ledger Link
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="accountName" className="text-xs font-medium">
                    Account Nickname
                  </Label>
                  <Input
                    id="accountName"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="e.g. Primary Operating Checking"
                    className="h-9 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="institution" className="text-xs font-medium">
                    Bank / Institution
                  </Label>
                  <Input
                    id="institution"
                    value={newInstitution}
                    onChange={(e) => setNewInstitution(e.target.value)}
                    placeholder="e.g. Mercury, Maybank, Chase"
                    className="h-9 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountType" className="text-xs font-medium">
                    Account Type
                  </Label>
                  <select
                    id="accountType"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={newAccountType}
                    onChange={(e) =>
                      setNewAccountType(e.target.value as 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD')
                    }
                  >
                    <option value="CHECKING">Checking Account</option>
                    <option value="SAVINGS">Savings Account</option>
                    <option value="CREDIT_CARD">Corporate Credit Card</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency" className="text-xs font-medium">
                    Currency
                  </Label>
                  <select
                    id="currency"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                  >
                    <option value="USD">USD ($ - US Dollar)</option>
                    <option value="MYR">MYR (RM - Malaysian Ringgit)</option>
                    <option value="SGD">SGD (S$ - Singapore Dollar)</option>
                    <option value="EUR">EUR (€ - Euro)</option>
                    <option value="GBP">GBP (£ - British Pound)</option>
                    <option value="AED">AED (AED - UAE Dirham)</option>
                    <option value="CAD">CAD (C$ - Canadian Dollar)</option>
                    <option value="AUD">AUD (A$ - Australian Dollar)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last4" className="text-xs font-medium">
                    Last 4 Digits
                  </Label>
                  <Input
                    id="last4"
                    maxLength={4}
                    value={newLast4}
                    onChange={(e) => setNewLast4(e.target.value.replace(/\D/g, ''))}
                    placeholder="4092"
                    className="h-9 text-sm font-mono"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingAccount(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingAccount}>
                  {isSubmittingAccount ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Account'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Main Grid: Connected Accounts vs. Statement Uploader */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column (5 cols): Connected Bank Accounts */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <Card className="border-border/70 shadow-sm flex-1">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Registered Accounts</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Select an account to associate with statement uploads.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground">
                  {accounts.length} {accounts.length === 1 ? 'Account' : 'Accounts'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {isLoadingAccounts ? (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs">Loading accounts...</span>
                </div>
              ) : (
                <>
                  {/* Option 1: AI Auto-Detect */}
                  <div
                    onClick={() => setSelectedAccountId('')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                      !selectedAccountId || selectedAccountId === 'NEW_MANUAL'
                        ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border/60 hover:border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          Auto-Detect from Statement
                        </span>
                        {!selectedAccountId && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-primary/15 text-primary border-primary/20 font-medium px-2 py-0"
                          >
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        AI reads the bank name, currency, and account number automatically.
                      </p>
                    </div>
                  </div>

                  {/* List of Registered Accounts */}
                  {accounts.map((acc) => {
                    const balanceNum = Number(acc.currentBalanceCents || 0) / 100;
                    const isSelected = selectedAccountId === acc.id;

                    return (
                      <div
                        key={acc.id}
                        onClick={() => setSelectedAccountId(acc.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                          isSelected
                            ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border/60 hover:border-border hover:bg-muted/30'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-muted border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
                          {acc.accountType === 'CREDIT_CARD' ? (
                            <CreditCard className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Landmark className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm truncate text-foreground">
                              {acc.accountName}
                            </span>
                            {isSelected && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-primary/15 text-primary border-primary/20 font-medium px-2 py-0"
                              >
                                Selected
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1 text-xs">
                            <span className="text-muted-foreground truncate">
                              {acc.institutionName} •••• {acc.accountNumberLast4}
                            </span>
                            <span className="font-mono font-medium text-foreground">
                              {formatCurrency(balanceNum, acc.currency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Option 3: Manual Entry Override */}
                  <div
                    onClick={() =>
                      setSelectedAccountId(selectedAccountId === 'NEW_MANUAL' ? '' : 'NEW_MANUAL')
                    }
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between text-xs ${
                      selectedAccountId === 'NEW_MANUAL'
                        ? 'border-primary/40 bg-primary/5 font-medium'
                        : 'border-dashed border-border/70 hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span>Need to enter bank name manually for this upload?</span>
                    <span className="text-primary hover:underline font-medium">
                      {selectedAccountId === 'NEW_MANUAL' ? 'Hide Details' : 'Manual Entry →'}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (7 cols): Modern Statement Uploader & Stepper */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Permanent Upload Dropzone Card */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-primary" />
                    Upload Bank Statements
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Drag and drop single or batch PDF statements and CSV exports for automated
                    multi-file reconciliation.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                >
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Bank-Grade Encryption
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Manual Bank Details Form (Shown if Manual Selected) */}
              {selectedAccountId === 'NEW_MANUAL' && (
                <div className="p-4 bg-muted/40 rounded-xl space-y-3 border border-border/60 text-sm animate-in fade-in duration-200">
                  <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Manual Bank Identifier
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="manualBankName" className="text-xs">
                        Bank Name
                      </Label>
                      <Input
                        id="manualBankName"
                        className="h-8 text-xs"
                        value={manualBankName}
                        onChange={(e) => setManualBankName(e.target.value)}
                        placeholder="e.g. JPMorgan Chase"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="manualAccountType" className="text-xs">
                        Account Type
                      </Label>
                      <select
                        id="manualAccountType"
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                        value={manualAccountType}
                        onChange={(e) => setManualAccountType(e.target.value as any)}
                      >
                        <option value="CHECKING">Checking</option>
                        <option value="SAVINGS">Savings</option>
                        <option value="CREDIT_CARD">Credit Card</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="manualLast4" className="text-xs">
                        Last 4 Digits
                      </Label>
                      <Input
                        id="manualLast4"
                        maxLength={4}
                        className="h-8 text-xs font-mono"
                        value={manualLast4}
                        onChange={(e) => setManualLast4(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 4092"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Hidden File Input with multiple attribute */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.csv,text/csv,application/pdf"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {/* Upload Dropzone */}
              <div
                className={`border-2 border-dashed rounded-xl p-7 flex flex-col items-center justify-center text-center space-y-3 transition-all cursor-pointer ${
                  isDragging
                    ? 'border-primary bg-primary/10 ring-4 ring-primary/10'
                    : 'hover:bg-muted/40 border-border/80 hover:border-primary/50'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={triggerUploadClick}
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-foreground">
                    Click or drag bank statements here
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Select one or <strong>multiple statements (.PDF or .CSV)</strong> for automatic
                    batch processing.
                  </p>
                </div>

                {/* Compatibility Badges */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {[
                    'Maybank',
                    'Mercury',
                    'Chase',
                    'Stripe',
                    'Wise',
                    'Standard CSV',
                    'Multi-File Batch',
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Processing Queue Card (Rendered whenever batchQueue has items) */}
          {batchQueue.length > 0 && (
            <Card className="border-border/70 shadow-sm animate-in fade-in duration-300">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        Active Processing Queue
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {batchQueue.filter((i) => i.status === 'COMPLETED').length} of{' '}
                        {batchQueue.length} completed
                        {batchQueue.some(
                          (i) => i.status !== 'COMPLETED' && i.status !== 'FAILED',
                        ) && ' • Processing in background'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {batchQueue.some((i) => i.status === 'COMPLETED') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={handleClearCompleted}
                      >
                        Clear Completed
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {batchQueue.map((item) => {
                  const isDone = item.status === 'COMPLETED';
                  const isFail = item.status === 'FAILED';
                  const isRunning = !isDone && !isFail && item.status !== 'QUEUED';
                  const isQueued = item.status === 'QUEUED';

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isDone
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : isFail
                            ? 'border-destructive/30 bg-destructive/5'
                            : isRunning
                              ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border/60 bg-muted/20'
                      }`}
                    >
                      {/* Item Top Row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                              isDone
                                ? 'bg-emerald-500 text-white'
                                : isFail
                                  ? 'bg-destructive text-destructive-foreground'
                                  : isRunning
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isDone ? (
                              <Check className="w-4 h-4" />
                            ) : isFail ? (
                              <AlertCircle className="w-4 h-4" />
                            ) : isRunning ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Clock className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground font-mono truncate max-w-[200px] sm:max-w-xs">
                                {item.fileName}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ({(item.fileSize / (1024 * 1024)).toFixed(2)} MB)
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {item.stageName}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isQueued && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-muted/60 text-muted-foreground border-border/70"
                            >
                              Queued
                            </Badge>
                          )}
                          {isRunning && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-primary/10 text-primary border-primary/30 font-medium"
                            >
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              {item.progress}%
                            </Badge>
                          )}
                          {isDone && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium"
                            >
                              Reconciled ✓
                            </Badge>
                          )}
                          {isFail && (
                            <Badge variant="destructive" className="text-[10px]">
                              Failed
                            </Badge>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-md"
                            onClick={() => handleRemoveQueueItem(item.id)}
                            title="Dismiss from queue"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Progress Bar (for In-Flight & Queued) */}
                      {!isDone && !isFail && (
                        <div className="mt-2.5 space-y-1">
                          <Progress value={item.progress} className="h-1.5 rounded-full" />
                        </div>
                      )}

                      {/* Completed Summary & Action Buttons */}
                      {isDone && (
                        <div className="mt-3 pt-2.5 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span>
                              <strong className="text-foreground font-mono">
                                {item.transactionsCount || item.result?.transactions?.length || 0}
                              </strong>{' '}
                              rows
                            </span>
                            <span>•</span>
                            <span>
                              <strong className="text-blue-600 dark:text-blue-400 font-mono">
                                {item.result?.proposals?.length || 0}
                              </strong>{' '}
                              AI matches
                            </span>
                            {(item.result?.exceptions?.length ?? 0) > 0 && (
                              <>
                                <span>•</span>
                                <span>
                                  <strong className="text-amber-600 dark:text-amber-400 font-mono">
                                    {item.result?.exceptions?.length}
                                  </strong>{' '}
                                  needs review
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                              <Link href="/transactions">
                                View Transactions <ArrowRight className="w-3 h-3 ml-1" />
                              </Link>
                            </Button>
                            {(item.result?.exceptions?.length ?? 0) > 0 && (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-500/30 text-amber-800 dark:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20"
                              >
                                <Link href="/exceptions">
                                  Review Approvals ({item.result?.exceptions?.length})
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Failure Message & Action */}
                      {isFail && (
                        <div className="mt-2.5 pt-2 border-t border-destructive/20 flex items-center justify-between gap-2 text-xs">
                          <span className="text-destructive font-medium truncate">
                            {item.errorMessage || 'Statement processing failed'}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px] px-2"
                            onClick={() => {
                              if (item.file) {
                                setBatchQueue((prev) =>
                                  prev.map((q) =>
                                    q.id === item.id
                                      ? {
                                          ...q,
                                          status: 'QUEUED',
                                          progress: 0,
                                          errorMessage: undefined,
                                          stageName: 'Queued in batch...',
                                        }
                                      : q,
                                  ),
                                );
                              } else if (item.statementId) {
                                handleRetryStatement(item.statementId);
                              }
                            }}
                          >
                            Retry
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Statement History & Upload Activity Section */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Statement Upload & Processing History
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                All uploaded statements, automated reconciliation audits, and processing records.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                {statements.length} {statements.length === 1 ? 'Statement' : 'Statements'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={loadStatements}
                disabled={isLoadingStatements}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 mr-1 ${isLoadingStatements ? 'animate-spin' : ''}`}
                />
                Refresh History
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingStatements ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-xs">Loading statement history...</span>
            </div>
          ) : statements.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">No statements uploaded yet</p>
              <p className="text-xs max-w-sm mx-auto">
                Upload your first bank statement above to see automated extraction and
                reconciliation history.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border/50">
                    <TableHead className="text-xs font-semibold">Statement File</TableHead>
                    <TableHead className="text-xs font-semibold">Bank / Account</TableHead>
                    <TableHead className="text-xs font-semibold">Period</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Money Out</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Money In</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Uploaded</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.map((stmt) => {
                    const linkedAccount = accounts.find((a) => a.id === stmt.bankAccountId);
                    const debitsNum = Number(stmt.totalDebitsCents || 0) / 100;
                    const creditsNum = Number(stmt.totalCreditsCents || 0) / 100;
                    const currency = linkedAccount?.currency || tenantCurrency || 'MYR';

                    let statusBadge = (
                      <Badge
                        variant="outline"
                        className="text-[11px] font-medium bg-muted text-muted-foreground"
                      >
                        {stmt.status}
                      </Badge>
                    );

                    if (stmt.status === 'RECONCILED') {
                      statusBadge = (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          Reconciled
                        </Badge>
                      );
                    } else if (stmt.status === 'PARSED') {
                      statusBadge = (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          Parsed
                        </Badge>
                      );
                    } else if (stmt.status === 'PROCESSING' || stmt.status === 'UPLOADED') {
                      statusBadge = (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1"
                        >
                          <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400" />
                          Processing
                        </Badge>
                      );
                    } else if (stmt.status === 'FAILED') {
                      statusBadge = (
                        <Badge variant="destructive" className="text-[11px] font-medium gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Failed
                        </Badge>
                      );
                    } else if (stmt.status === 'NEEDS_REVIEW' || stmt.status === 'EXCEPTION') {
                      statusBadge = (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1"
                        >
                          <AlertCircle className="w-3 h-3" />
                          Needs Review
                        </Badge>
                      );
                    }

                    return (
                      <TableRow key={stmt.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-foreground truncate block max-w-[200px] sm:max-w-xs">
                                {stmt.fileName}
                              </span>
                              {stmt.errorMessage && (
                                <span className="text-[10px] text-destructive truncate block max-w-[200px]">
                                  {stmt.errorMessage}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {linkedAccount ? (
                            <span>
                              {linkedAccount.institutionName} ••••{' '}
                              {linkedAccount.accountNumberLast4}
                            </span>
                          ) : stmt.bankDetected ? (
                            <span className="capitalize">{stmt.bankDetected}</span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">Auto-Detected</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {stmt.statementStartDate && stmt.statementEndDate ? (
                            <span>
                              {formatIsoDate(stmt.statementStartDate)} →{' '}
                              {formatIsoDate(stmt.statementEndDate)}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-right text-rose-600 dark:text-rose-400 tabular-nums">
                          {debitsNum > 0 ? formatCurrency(debitsNum, currency) : '—'}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {creditsNum > 0 ? formatCurrency(creditsNum, currency) : '—'}
                        </TableCell>
                        <TableCell className="text-center">{statusBadge}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatIsoDate(stmt.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {stmt.status === 'FAILED' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2 gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                                onClick={() => handleRetryStatement(stmt.id)}
                                disabled={retryingId === stmt.id}
                              >
                                <RotateCcw
                                  className={`w-3 h-3 ${retryingId === stmt.id ? 'animate-spin' : ''}`}
                                />
                                Retry
                              </Button>
                            ) : (
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                              >
                                <Link href="/transactions">
                                  Transactions <ArrowRight className="w-3 h-3 ml-1" />
                                </Link>
                              </Button>
                            )}
                          </div>
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
    </div>
  );
}
