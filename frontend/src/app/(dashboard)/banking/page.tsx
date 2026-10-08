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

const ACTIVE_JOB_STORAGE_KEY = 'agentic_os_active_banking_job';
const LAST_RESULT_STORAGE_KEY = 'agentic_os_last_upload_result';

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

  // Upload State
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [activeStep, setActiveStep] = React.useState<number>(1);
  const [processingStage, setProcessingStage] = React.useState<
    'idle' | 'uploading' | 'extracting' | 'classifying' | 'reconciling' | 'complete' | 'error'
  >('idle');
  const [activeJobFileName, setActiveJobFileName] = React.useState<string>('');
  const [uploadResult, setUploadResult] = React.useState<UploadResult | null>(null);

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

  const pollJob = React.useCallback(
    async (jobId: string, fileName?: string) => {
      setIsUploading(true);
      if (fileName) {
        setActiveJobFileName(fileName);
      }

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
              progress?: number;
            };
          }>(`/banking/statements/jobs/${jobId}`, { silent: true });

          const { state, result, failedReason, progress } = statusRes.data;

          if (state === 'completed' && result) {
            setActiveStep(4);
            setProcessingStage('complete');
            setUploadProgress(100);
            setUploadResult(result);
            try {
              localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
              localStorage.setItem(
                LAST_RESULT_STORAGE_KEY,
                JSON.stringify({ result, timestamp: Date.now() }),
              );
            } catch (e) {
              console.error('Failed to save to localStorage:', e);
            }
            loadAccounts();
            loadStatements();
            toast.success(
              `Statement ${fileName ? `"${fileName}"` : ''} processed and reconciled successfully!`,
            );
            completed = true;
            break;
          } else if (state === 'failed') {
            try {
              localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
            } catch (e) {}
            setProcessingStage('error');
            loadStatements();
            toast.error(failedReason || 'Statement parsing failed during background processing');
            break;
          } else if (state === 'active') {
            setActiveStep(3);
            setProcessingStage('classifying');
            setUploadProgress((prev) => Math.min(Math.max(prev, 60) + Math.random() * 5, 92));
          } else if (state === 'waiting' || state === 'delayed') {
            setActiveStep(2);
            setProcessingStage('extracting');
            setUploadProgress((prev) => Math.max(prev, 35));
          } else if (state === 'not_found') {
            // If the job was cleaned up by BullMQ, refresh statements list
            try {
              localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
            } catch (e) {}
            await loadStatements();
            await loadAccounts();
            break;
          }
        } catch (pollErr: any) {
          console.warn('Job polling retry tick:', pollErr);
        }

        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      setIsUploading(false);
    },
    [loadAccounts, loadStatements],
  );

  // Rehydrate active job or last result from localStorage on mount
  React.useEffect(() => {
    loadAccounts();
    loadStatements();

    try {
      const activeJobStr = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
      if (activeJobStr) {
        const savedJob = JSON.parse(activeJobStr);
        const isRecent = savedJob?.startedAt && Date.now() - savedJob.startedAt < 20 * 60 * 1000;
        if (savedJob?.jobId && isRecent) {
          setIsUploading(true);
          setActiveJobFileName(savedJob.fileName || 'Statement');
          setActiveStep(2);
          setProcessingStage('extracting');
          setUploadProgress(40);
          pollJob(savedJob.jobId, savedJob.fileName);
          return;
        } else if (isRecent && savedJob?.fileName) {
          // File was in flight during reload
          setIsUploading(true);
          setActiveJobFileName(savedJob.fileName);
          setActiveStep(1);
          setProcessingStage('uploading');
          setUploadProgress(25);
          apiClient
            .get<{ data: BankStatementRecord[] }>('/banking/statements')
            .then((res) => {
              const list = res.data || [];
              const match = list.find((s) => s.fileName === savedJob.fileName);
              if (match) {
                setStatements(list);
                setIsUploading(false);
                setProcessingStage('complete');
                localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
              }
            })
            .catch(() => {});
        } else {
          localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
        }
      }

      // If no active job, check if recent result exists (< 30 min)
      const lastResultStr = localStorage.getItem(LAST_RESULT_STORAGE_KEY);
      if (lastResultStr) {
        const saved = JSON.parse(lastResultStr);
        if (saved?.result && Date.now() - saved.timestamp < 30 * 60 * 1000) {
          setUploadResult(saved.result);
          setProcessingStage('complete');
        }
      }
    } catch (err) {
      console.error('Error rehydrating upload state:', err);
    }
  }, [loadAccounts, loadStatements, pollJob]);

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

  const handleFileProcess = async (file: File) => {
    const targetAccountId = selectedAccountId || undefined;

    setIsUploading(true);
    setActiveJobFileName(file.name);
    setProcessingStage('uploading');
    setActiveStep(1);
    setUploadProgress(15);
    setUploadResult(null);

    // Save initial in-flight state immediately
    try {
      localStorage.setItem(
        ACTIVE_JOB_STORAGE_KEY,
        JSON.stringify({
          fileName: file.name,
          startedAt: Date.now(),
          selectedAccountId: targetAccountId,
        }),
      );
    } catch (e) {}

    try {
      const isPdf = file.name.endsWith('.pdf') || file.type.includes('pdf');
      const mimeType = isPdf ? ('application/pdf' as const) : ('text/csv' as const);

      // 1. Get presigned URL
      const presignedRes = await apiClient.post<{ data: { url: string; objectKey: string } }>(
        '/banking/statements/presigned-url',
        {
          fileName: file.name,
          mimeType,
        },
      );
      const { url, objectKey } = presignedRes.data;

      setUploadProgress(30);

      // 2. Upload directly to S3 (Neon Object Storage)
      const s3Res = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': mimeType,
        },
      });

      if (!s3Res.ok) {
        throw new Error('Failed to upload file to storage bucket');
      }

      setActiveStep(2);
      setProcessingStage('extracting');
      setUploadProgress(50);

      // 3. Queue the background processing job
      const payload: any = {
        fileName: file.name,
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

      // Persist active BullMQ job to localStorage so page refreshes resume polling
      try {
        localStorage.setItem(
          ACTIVE_JOB_STORAGE_KEY,
          JSON.stringify({
            jobId,
            fileName: file.name,
            startedAt: Date.now(),
            selectedAccountId: targetAccountId,
          }),
        );
      } catch (e) {
        console.error('Failed to store active job:', e);
      }

      // 4. Poll for job completion
      await pollJob(jobId, file.name);
    } catch (err: any) {
      setProcessingStage('error');
      try {
        localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
      } catch (e) {}
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Statement processing failed';
      toast.error(errorMessage);
      console.error(err);
      setIsUploading(false);
    }
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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const triggerUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleResetUpload = () => {
    try {
      localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
      localStorage.removeItem(LAST_RESULT_STORAGE_KEY);
    } catch (e) {}
    setProcessingStage('idle');
    setUploadResult(null);
    setActiveJobFileName('');
  };

  const steps = [
    {
      num: 1,
      title: 'Reading Document',
      desc: 'Securely parsing PDF statement layout',
    },
    {
      num: 2,
      title: 'Verifying Numbers',
      desc: 'Extracting opening, closing & line totals',
    },
    {
      num: 3,
      title: 'Auto-Categorizing',
      desc: 'Matching vendor payees & accounts',
    },
    {
      num: 4,
      title: 'Books Reconciled',
      desc: 'Confirming balanced debits & credits',
    },
  ];

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
          <Card className="border-border/70 shadow-sm flex-1">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Upload Bank Statement</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Drag and drop official PDF statements or CSV exports for instant reconciliation.
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
            <CardContent className="pt-4 space-y-5">
              {/* Manual Bank Details Form (Shown if Manual Selected) */}
              {selectedAccountId === 'NEW_MANUAL' && !isUploading && (
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

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,text/csv,application/pdf"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {/* Upload Dropzone */}
              {!isUploading && processingStage !== 'complete' ? (
                <div
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4 transition-all cursor-pointer ${
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
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-base text-foreground">
                      Click or drag bank statement here
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Seamlessly processes official statements in <strong>.PDF</strong> or{' '}
                      <strong>.CSV</strong> formats.
                    </p>
                  </div>

                  {/* Compatibility Badges */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                    {['Maybank', 'Mercury', 'Chase', 'Stripe', 'Wise', 'Standard CSV'].map(
                      (tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50"
                        >
                          {tag}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ) : isUploading ? (
                /* Sleek 4-Stage Stepper Pipeline */
                <div className="space-y-6 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm text-foreground">
                          Processing Bank Statement...
                        </span>
                        {activeJobFileName && (
                          <span className="text-[11px] text-muted-foreground font-mono truncate max-w-xs">
                            {activeJobFileName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-muted-foreground tabular-nums">
                      {Math.round(uploadProgress)}%
                    </span>
                  </div>

                  <Progress value={uploadProgress} className="h-2 rounded-full" />

                  {/* Stepper Stages Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {steps.map((step) => {
                      const isDone = activeStep > step.num || processingStage === 'complete';
                      const isCurrent = activeStep === step.num && processingStage !== 'complete';

                      return (
                        <div
                          key={step.num}
                          className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                            isDone
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : isCurrent
                                ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-sm'
                                : 'border-border/40 bg-muted/20 opacity-60'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 font-mono text-xs font-semibold ${
                              isDone
                                ? 'bg-emerald-500 text-white'
                                : isCurrent
                                  ? 'bg-primary text-primary-foreground animate-pulse'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isDone ? <Check className="w-3.5 h-3.5" /> : step.num}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-foreground leading-snug">
                              {step.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {step.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Success / Completed Result View */
                <div className="space-y-5 py-2 animate-in fade-in duration-300">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <FileCheck2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm text-emerald-900 dark:text-emerald-200">
                        Statement Successfully Reconciled & Recorded!
                      </p>
                      <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 font-mono">
                        File: {uploadResult?.statement.fileName}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3.5 bg-card border border-border/60 rounded-xl shadow-sm">
                      <div className="text-2xl font-bold tabular-nums text-foreground">
                        {uploadResult?.transactions?.length ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">
                        Extracted Rows
                      </div>
                    </div>
                    <div className="p-3.5 bg-card border border-border/60 rounded-xl shadow-sm">
                      <div className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                        {uploadResult?.proposals?.length ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">
                        AI Matches
                      </div>
                    </div>
                    <div className="p-3.5 bg-card border border-border/60 rounded-xl shadow-sm">
                      <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {uploadResult?.exceptions?.length ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">
                        Needs Review
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                    <Button asChild className="flex-1 h-9">
                      <Link href="/transactions">
                        View Transactions <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Link>
                    </Button>
                    {(uploadResult?.exceptions?.length ?? 0) > 0 && (
                      <Button
                        asChild
                        variant="outline"
                        className="flex-1 h-9 border-amber-500/30 text-amber-800 dark:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20"
                      >
                        <Link href="/exceptions">
                          Review Approvals ({uploadResult?.exceptions.length})
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-9" onClick={handleResetUpload}>
                      Upload Another
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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
