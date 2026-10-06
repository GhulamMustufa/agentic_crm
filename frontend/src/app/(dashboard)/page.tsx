"use client"

import * as React from "react"
import Link from "next/link"
import { CheckCircle2, AlertCircle, DollarSign, Activity } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Accountant Overview</h1>
          <p className="text-muted-foreground mt-1">
            What did my AI accountant accomplish today?
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/banking">Upload Statement</Link>
          </Button>
          <Button asChild>
            <Link href="/exceptions">View Exceptions</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Books Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">Up to date</div>
            <p className="text-xs text-muted-foreground mt-1">Last synced 2 hours ago</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions Processed</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,481</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-500 font-medium">97%</span> auto-categorized
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconciled Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">$142,500.00</div>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">Exceptions</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">12</div>
            <p className="text-xs text-orange-600/80 dark:text-orange-400/80 mt-1">Requiring human attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Recent AI Activity</CardTitle>
            <CardDescription>
              Actions completed autonomously in the last 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { time: "10:42 AM", action: "Reconciled 145 transactions from Chase Checking", type: "success" },
              { time: "09:15 AM", action: "Flagged duplicate invoice #INV-492 for Acme Corp", type: "warning" },
              { time: "08:30 AM", action: "Matched payroll run to 42 employee records", type: "success" },
              { time: "Yesterday", action: "Categorized $4,200 as Office Expenses (99% confidence)", type: "success" },
            ].map((activity, i) => (
              <div key={i} className="flex items-center gap-4 text-sm">
                <div className="w-2 h-2 rounded-full shrink-0 bg-primary/40" />
                <div className="w-20 text-muted-foreground shrink-0">{activity.time}</div>
                <div className="font-medium">{activity.action}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Upcoming Actions</CardTitle>
            <CardDescription>Tasks the AI has prepared for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Review 12 Exceptions</p>
                <p className="text-sm text-muted-foreground">Approve or correct AI decisions.</p>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/exceptions">Review</Link>
              </Button>
            </div>
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Missing Statements</p>
                <p className="text-sm text-muted-foreground">Upload October statement for SVB.</p>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/banking">Upload</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
