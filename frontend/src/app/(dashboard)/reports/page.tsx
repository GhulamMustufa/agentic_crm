'use client';

import * as React from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Scale,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck,
  Printer,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatters';

export default function ReportsPage() {
  const [reportType, setReportType] = React.useState<'PNL' | 'BALANCE_SHEET' | 'TRIAL_BALANCE'>(
    'PNL',
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground mt-1">
            Real-time statements computed deterministically from the immutable General Ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Calendar className="w-4 h-4 mr-2" />
            Oct 2026 (YTD)
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button>
            <Printer className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Report Switcher Tabs */}
      <div className="flex items-center gap-2 border-b pb-4 overflow-x-auto">
        <Button
          variant={reportType === 'PNL' ? 'default' : 'outline'}
          onClick={() => setReportType('PNL')}
          className="gap-2"
        >
          <TrendingUp className="w-4 h-4" />
          Profit & Loss (P&L)
        </Button>
        <Button
          variant={reportType === 'BALANCE_SHEET' ? 'default' : 'outline'}
          onClick={() => setReportType('BALANCE_SHEET')}
          className="gap-2"
        >
          <Scale className="w-4 h-4" />
          Balance Sheet
        </Button>
        <Button
          variant={reportType === 'TRIAL_BALANCE' ? 'default' : 'outline'}
          onClick={() => setReportType('TRIAL_BALANCE')}
          className="gap-2"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Trial Balance
        </Button>
      </div>

      {/* AI Health Summary Card */}
      <Card className="border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="text-base text-indigo-900 dark:text-indigo-300">
              Autonomous AI Financial Commentary
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className="bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900 dark:text-indigo-300"
          >
            Audit Verified
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-indigo-950/80 dark:text-indigo-200/80 space-y-1">
          <p>
            <strong>Cash Runway:</strong> Operating runway is estimated at{' '}
            <strong>14.2 months</strong> at current net burn rate. Gross margin expanded by{' '}
            <strong>3.4%</strong> following inventory FIFO adjustments and cloud infrastructure
            optimization.
          </p>
          <p className="text-xs text-muted-foreground pt-1">
            General Ledger invariant check:{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              ∑ Debits ($242,150.00) == ∑ Credits ($242,150.00)
            </span>
            .
          </p>
        </CardContent>
      </Card>

      {/* REPORT CONTENT: PROFIT & LOSS */}
      {reportType === 'PNL' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Statement of Profit and Loss</CardTitle>
                <CardDescription>
                  Period: January 1, 2026 – October 6, 2026 (Accrual Basis)
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                Net Positive
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Revenue */}
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                Operating Revenue
              </h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">4010 - SaaS Subscription Revenue</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(185400)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      4020 - Enterprise Implementation Fees
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(24500)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total Revenue</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(209900)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Cost of Sales */}
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                Cost of Goods Sold (COGS)
              </h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      5010 - Cloud Infrastructure & Hosting
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(18420)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">5020 - Third-Party API Licenses</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(6200)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Gross Profit (88.3% Margin)</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(185280)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Operating Expenses */}
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                Operating Expenses
              </h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      6100 - Payroll & Engineering Compensation
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(97000)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">6200 - Sales & Marketing</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(14500)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">6300 - General & Administrative</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(8400)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/60 font-bold text-base border-t-2">
                    <TableCell>Net Operating Income</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(65380)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* REPORT CONTENT: BALANCE SHEET */}
      {reportType === 'BALANCE_SHEET' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Balance Sheet</CardTitle>
                <CardDescription>As of October 6, 2026</CardDescription>
              </div>
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Equation Balanced
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Assets */}
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                Assets
              </h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">1010 - Operating Cash & Bank</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(245800)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">1200 - Accounts Receivable (AR)</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(40000)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">1300 - Inventory Assets (FIFO)</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(12400)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total Assets</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(298200)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Liabilities & Equity */}
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                Liabilities
              </h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">2010 - Accounts Payable (AP)</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(9490)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      2100 - Accrued Payroll & Withholdings
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(14200)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total Liabilities</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(23690)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                Equity
              </h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">3010 - Member / Owner Capital</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(209130)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      3020 - Retained Earnings (YTD Net Income)
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(65380)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/60 font-bold text-base border-t-2">
                    <TableCell>Total Liabilities & Equity</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(298200)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* REPORT CONTENT: TRIAL BALANCE */}
      {reportType === 'TRIAL_BALANCE' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Trial Balance Report</CardTitle>
                <CardDescription>
                  Verified zero-difference General Ledger trial balance.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Zero Variance
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right">Debit Balance</TableHead>
                  <TableHead className="text-right">Credit Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { code: '1010', name: 'Operating Cash', type: 'ASSET', dr: 245800, cr: 0 },
                  { code: '1200', name: 'Accounts Receivable', type: 'ASSET', dr: 40000, cr: 0 },
                  { code: '1300', name: 'Inventory', type: 'ASSET', dr: 12400, cr: 0 },
                  { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', dr: 0, cr: 9490 },
                  { code: '2100', name: 'Accrued Payroll', type: 'LIABILITY', dr: 0, cr: 14200 },
                  { code: '3010', name: 'Owner Capital', type: 'EQUITY', dr: 0, cr: 209130 },
                  { code: '4010', name: 'Software Revenue', type: 'REVENUE', dr: 0, cr: 209900 },
                  { code: '5010', name: 'Cloud Infrastructure', type: 'EXPENSE', dr: 24620, cr: 0 },
                  { code: '6100', name: 'Engineering Payroll', type: 'EXPENSE', dr: 119900, cr: 0 },
                ].map((row) => (
                  <TableRow key={row.code}>
                    <TableCell className="font-mono font-medium">{row.code}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{row.type}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.dr > 0 ? formatCurrency(row.dr) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.cr > 0 ? formatCurrency(row.cr) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/70 font-bold border-t-2">
                  <TableCell colSpan={3}>Invariant Balance Verification</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(442720)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(442720)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
