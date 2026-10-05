"use client"

import * as React from "react"
import { UploadCloud, Building2, FileText, CheckCircle2, Clock, MoreVertical, Loader2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function BankingPage() {
  const [isUploading, setIsUploading] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [processingStage, setProcessingStage] = React.useState<"idle" | "uploading" | "extracting" | "classifying" | "reconciling" | "complete">("idle")

  const simulateUpload = () => {
    setIsUploading(true)
    setProcessingStage("uploading")
    setUploadProgress(10)

    setTimeout(() => {
      setProcessingStage("extracting")
      setUploadProgress(40)
    }, 1500)

    setTimeout(() => {
      setProcessingStage("classifying")
      setUploadProgress(70)
    }, 3000)

    setTimeout(() => {
      setProcessingStage("reconciling")
      setUploadProgress(90)
    }, 4500)

    setTimeout(() => {
      setProcessingStage("complete")
      setUploadProgress(100)
    }, 6000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bank Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage accounts and statement processing.</p>
        </div>
        <Button>
          <Building2 className="w-4 h-4 mr-2" />
          Add Account
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>Your synced financial institutions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <div className="font-medium">Chase Business Checking</div>
                    <div className="text-xs text-muted-foreground">...4829</div>
                  </TableCell>
                  <TableCell className="tabular-nums">$42,500.00</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-xs">
                      2 hrs ago
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <div className="font-medium">SVB Corporate Savings</div>
                    <div className="text-xs text-muted-foreground">...1102</div>
                  </TableCell>
                  <TableCell className="tabular-nums">$100,000.00</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal text-xs text-orange-500 border-orange-200">
                      Statement Required
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload Statement</CardTitle>
            <CardDescription>Drag and drop a PDF or CSV to process manually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isUploading || processingStage === "complete" ? (
              <div 
                className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-center space-y-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={simulateUpload}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Click to upload statement</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    PDF, CSV, or QBO formats supported.
                  </p>
                </div>
                {processingStage === "complete" && (
                  <Badge className="bg-emerald-500 hover:bg-emerald-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Last upload successful
                  </Badge>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between text-sm font-medium">
                  <div className="flex items-center text-primary">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {processingStage === "uploading" && "Uploading document..."}
                    {processingStage === "extracting" && "AI is extracting transactions..."}
                    {processingStage === "classifying" && "AI is classifying vendors and categories..."}
                    {processingStage === "reconciling" && "Matching against the general ledger..."}
                  </div>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                
                <div className="space-y-2 pt-4">
                  <div className={`flex justify-between text-sm ${uploadProgress >= 40 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    <span className="flex items-center gap-2">
                      {uploadProgress >= 40 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Clock className="w-4 h-4" />}
                      Data Extraction
                    </span>
                    {uploadProgress >= 40 && <span>2,481 found</span>}
                  </div>
                  <div className={`flex justify-between text-sm ${uploadProgress >= 70 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    <span className="flex items-center gap-2">
                      {uploadProgress >= 70 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Clock className="w-4 h-4" />}
                      Classification
                    </span>
                    {uploadProgress >= 70 && <span>97% automated</span>}
                  </div>
                  <div className={`flex justify-between text-sm ${uploadProgress >= 90 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    <span className="flex items-center gap-2">
                      {uploadProgress >= 90 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Clock className="w-4 h-4" />}
                      Ledger Reconciliation
                    </span>
                    {uploadProgress >= 90 && <span className="text-orange-500 font-medium">12 exceptions</span>}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
