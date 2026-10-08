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
import { apiClient, ApiError } from '@/lib/api-client';
import { formatCurrency, formatIsoDate } from '@/lib/formatters';

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

export default function BankingPage() {
  const [accounts, setAccounts] = React.useState<BankAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = React.useState(true);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>('');

  // Account Creation Form State
  const [isAddingAccount, setIsAddingAccount] = React.useState(false);
  const [isSubmittingAccount, setIsSubmittingAccount] = React.useState(false);
  const [newAccountName, setNewAccountName] = React.useState('Primary Operating Checking');
  const [newInstitution, setNewInstitution] = React.useState('Mercury Bank');
  const [newAccountType, setNewAccountType] = React.useState<
    'CHECKING' | 'SAVINGS' | 'CREDIT_CARD'
  >('CHECKING');
  const [newLast4, setNewLast4] = React.useState('4092');
  const [newCurrency, setNewCurrency] = React.useState('USD');

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
  const [processingStage, setProcessingStage] = React.useState<
    'idle' | 'uploading' | 'extracting' | 'classifying' | 'reconciling' | 'complete' | 'error'
  >('idle');
  const [uploadResult, setUploadResult] = React.useState<UploadResult | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadAccounts = React.useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const response = await apiClient.get<{ data: BankAccount[] }>('/banking/accounts');
      const list = response.data || [];
      setAccounts(list);
      if (list.length > 0) {
        // Default to auto-detect (empty string) to encourage the new flow
        setSelectedAccountId('');
      }
    } catch (err) {
      console.error('Failed to load bank accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAccount(true);

    try {
      // 1. Get or seed ledger accounts
      let ledgerRes = await apiClient.get<{ data: LedgerAccount[] }>('/ledger/accounts');
      let ledgerAccounts = ledgerRes.data || [];

      if (ledgerAccounts.length === 0) {
        // Seed standard COA
        const seeded = await apiClient.post<{ data: LedgerAccount[] }>(
          '/ledger/accounts/seed-standard',
          {},
        );
        ledgerAccounts = seeded.data || [];
      }

      // Find cash account (1010)
      const cashAccount =
        ledgerAccounts.find(
          (acc) => acc.accountCode === '1010' || acc.subClassification === 'CASH',
        ) || ledgerAccounts[0];

      if (!cashAccount) {
        throw new Error('Unable to locate cash account in Chart of Accounts.');
      }

      // 2. Create the bank account
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
      toast.success('Bank account created successfully');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const handleFileProcess = async (file: File) => {
    const targetAccountId = selectedAccountId || undefined;

    setIsUploading(true);
    setProcessingStage('uploading');
    setUploadProgress(15);

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

      setProcessingStage('uploading');
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

      setProcessingStage('classifying');
      setUploadProgress(50);

      // 3. Queue the job
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
      setProcessingStage('extracting');

      // 4. Poll for job completion
      let attempts = 0;
      let completed = false;
      while (attempts < 120 && !completed) {
        // 120 * 3s = 6 minutes max
        attempts++;
        const statusRes = await apiClient.get<{
          data: { id: string; state: string; result: UploadResult | null; failedReason?: string };
        }>(`/banking/statements/jobs/${jobId}`);
        const { state, result, failedReason } = statusRes.data;

        if (state === 'completed' && result) {
          setProcessingStage('complete');
          setUploadProgress(100);
          setUploadResult(result);
          loadAccounts(); // Refresh balances
          toast.success('Statement uploaded and parsed successfully');
          completed = true;
          break;
        } else if (state === 'failed') {
          throw new Error(failedReason || 'Job failed during background processing');
        } else if (state === 'active') {
          setProcessingStage('extracting');
          // Increment progress bar to simulate AI thinking
          setUploadProgress((prev) => Math.min(prev + Math.random() * 5, 95));
        } else if (state === 'waiting' || state === 'delayed') {
          setProcessingStage('reconciling');
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!completed) {
        throw new Error('Polling timed out. The document is still processing in the background.');
      }
    } catch (err: any) {
      setProcessingStage('error');
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Statement processing failed';
      toast.error(errorMessage);
      console.error(err);
    } finally {
      setIsUploading(false);
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bank Accounts & Ingestion</h1>
          <p className="text-muted-foreground mt-1">
            Manage linked institutional accounts and upload bank statements for automated ledger
            ingestion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={loadAccounts} disabled={isLoadingAccounts}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingAccounts ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddingAccount((prev) => !prev)}>
            <Building2 className="w-4 h-4 mr-2" />
            {isAddingAccount ? 'Cancel' : 'Add Account'}
          </Button>
        </div>
      </div>

      {/* Add Account Inline Form */}
      {isAddingAccount && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Connect Bank Account</CardTitle>
            <CardDescription>
              Register an institutional bank account linked to your General Ledger Cash account
              (1010).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="accountName">Account Name</Label>
                  <Input
                    id="accountName"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="e.g. Chase Operating Checking"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="institution">Financial Institution</Label>
                  <Input
                    id="institution"
                    value={newInstitution}
                    onChange={(e) => setNewInstitution(e.target.value)}
                    placeholder="e.g. JPMorgan Chase"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="accountType">Account Type</Label>
                  <select
                    id="accountType"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={newAccountType}
                    onChange={(e) =>
                      setNewAccountType(e.target.value as 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD')
                    }
                  >
                    <option value="CHECKING">Checking</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="currency">Currency</Label>
                  <select
                    id="currency"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                    <option value="INR">INR (₹ - Indian Rupee)</option>
                    <option value="PKR">PKR (Rs - Pakistani Rupee)</option>
                    <option value="JPY">JPY (¥ - Japanese Yen)</option>
                    <option value="CNY">CNY (¥ - Chinese Yuan)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="last4">Last 4 Digits</Label>
                  <Input
                    id="last4"
                    maxLength={4}
                    value={newLast4}
                    onChange={(e) => setNewLast4(e.target.value.replace(/\D/g, ''))}
                    placeholder="4092"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsAddingAccount(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingAccount}>
                  {isSubmittingAccount ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Connected Accounts Card */}
        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>Institutions registered for automated reconciliation.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAccounts ? (
              <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-sm">Loading connected institutions...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <Landmark className="w-10 h-10 mx-auto text-muted-foreground/60" />
                <div>
                  <h4 className="font-semibold text-sm">No Bank Accounts Configured</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Add your primary checking or savings account to start uploading statements and
                    running AI classification.
                  </p>
                </div>
                <Button size="sm" onClick={() => setIsAddingAccount(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Primary Account
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    className={`cursor-pointer transition-colors ${
                      !selectedAccountId || selectedAccountId === 'NEW_MANUAL'
                        ? 'bg-muted/70 font-medium'
                        : 'hover:bg-muted/30'
                    }`}
                    onClick={() => setSelectedAccountId('')}
                  >
                    <TableCell colSpan={4}>
                      <div className="font-medium flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        Auto-detect from statement
                        {!selectedAccountId && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            Selected
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Let AI read the PDF and automatically assign or create the bank account, or
                        provide details manually below.
                      </div>
                    </TableCell>
                  </TableRow>
                  {accounts.map((acc) => {
                    const balanceNum = Number(acc.currentBalanceCents || 0) / 100;
                    const isSelected = selectedAccountId === acc.id;

                    return (
                      <TableRow
                        key={acc.id}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-muted/70 font-medium' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => setSelectedAccountId(acc.id)}
                      >
                        <TableCell>
                          <div className="font-medium flex items-center gap-2">
                            {acc.accountName}
                            {isSelected && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                Selected
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {acc.institutionName} •••• {acc.accountNumberLast4}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums font-mono">
                          {formatCurrency(balanceNum, acc.currency)}
                          <Badge variant="outline" className="ml-2 text-[10px] font-mono uppercase">
                            {acc.currency || 'USD'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {acc.accountType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Upload Statement Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Upload Statement</CardTitle>
                <CardDescription>
                  Upload bank statements (PDF or CSV) to trigger the live AI ingestion pipeline.
                </CardDescription>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Target Account:</span>
                <select
                  className="text-xs font-semibold bg-transparent border-b border-input focus:outline-none"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  <option value="">Auto-Detect from Statement</option>
                  <option value="NEW_MANUAL">Provide Manual Details</option>
                  <optgroup label="Existing Accounts">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} (•••• {a.accountNumberLast4})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Manual Bank Details (Shown if 'Provide Manual Details' is selected) */}
            {selectedAccountId === 'NEW_MANUAL' && !isUploading && (
              <div className="p-4 bg-muted/30 rounded-lg space-y-4 border border-input text-sm">
                <div className="font-medium">Manual Bank Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="manualBankName" className="text-xs">
                      Bank Name
                    </Label>
                    <Input
                      id="manualBankName"
                      size={1}
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
                      className="h-8 text-xs"
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

            {!isUploading && processingStage !== 'complete' ? (
              <div
                className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-center space-y-4 transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'hover:bg-muted/50 border-muted-foreground/25'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={triggerUploadClick}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Click or drag bank statement here</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Accepts official bank statements in <strong>.PDF</strong> or{' '}
                    <strong>.CSV</strong> formats
                  </p>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Chase, Mercury, SVB, Stripe, or standard
                    CSV
                  </span>
                </div>
              </div>
            ) : isUploading ? (
              <div className="space-y-6 py-4">
                <div className="flex items-center justify-between text-sm font-medium">
                  <div className="flex items-center text-primary">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {processingStage === 'uploading' &&
                      'Uploading document & calculating SHA-256 fingerprint...'}
                    {processingStage === 'extracting' &&
                      'Extracting line items and balances via AI OCR...'}
                    {processingStage === 'classifying' &&
                      'Assigning General Ledger codes and counterparties...'}
                    {processingStage === 'reconciling' &&
                      'Verifying double-entry invariants & anomalies...'}
                  </div>
                  <span className="tabular-nums font-mono">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />

                <div className="space-y-3 pt-2">
                  <div
                    className={`flex justify-between text-sm ${
                      uploadProgress >= 15 ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {uploadProgress >= 15 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      File Cryptographic Verification
                    </span>
                    {uploadProgress >= 15 && (
                      <span className="text-xs text-muted-foreground">SHA-256 Validated</span>
                    )}
                  </div>

                  <div
                    className={`flex justify-between text-sm ${
                      uploadProgress >= 45 ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {uploadProgress >= 45 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      Data Extraction
                    </span>
                    {uploadProgress >= 45 && (
                      <span className="text-xs text-muted-foreground">Parsing Line Items...</span>
                    )}
                  </div>

                  <div
                    className={`flex justify-between text-sm ${
                      uploadProgress >= 75 ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {uploadProgress >= 75 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      Chart of Accounts Classification
                    </span>
                    {uploadProgress >= 75 && (
                      <span className="text-xs text-muted-foreground">Heuristic + LLM Routing</span>
                    )}
                  </div>

                  <div
                    className={`flex justify-between text-sm ${
                      uploadProgress >= 90 ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {uploadProgress >= 90 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      Double-Entry General Ledger Reconciliation
                    </span>
                    {uploadProgress >= 90 && (
                      <span className="text-xs text-emerald-500">
                        Checking Sum(Debits) == Sum(Credits)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Success / Results Display */
              <div className="space-y-5 py-2">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Statement Successfully Ingested & Reconciled!
                    </p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300">
                      Statement ID: <span className="font-mono">{uploadResult?.statement.id}</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-card border rounded-lg">
                    <div className="text-2xl font-bold tabular-nums text-primary">
                      {uploadResult?.transactions?.length ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Transactions Extracted</div>
                  </div>
                  <div className="p-3 bg-card border rounded-lg">
                    <div className="text-2xl font-bold tabular-nums text-indigo-500">
                      {uploadResult?.proposals?.length ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">AI Proposals Generated</div>
                  </div>
                  <div className="p-3 bg-card border rounded-lg">
                    <div className="text-2xl font-bold tabular-nums text-amber-500">
                      {uploadResult?.exceptions?.length ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Exceptions Flagged</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button asChild className="flex-1">
                    <Link href="/transactions">
                      View Transactions <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                  {(uploadResult?.exceptions?.length ?? 0) > 0 && (
                    <Button asChild variant="outline" className="flex-1">
                      <Link href="/exceptions">
                        Review Exceptions ({uploadResult?.exceptions.length})
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setProcessingStage('idle');
                      setUploadResult(null);
                    }}
                  >
                    Upload Another
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
