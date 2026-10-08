'use client';

import * as React from 'react';
import { Search, ShieldAlert, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExceptionListClient } from './_components/exception-list-client';

export default function ExceptionsPage() {
  const [searchTerm, setSearchTerm] = React.useState('');

  return (
    <div className="flex flex-col min-h-0 md:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Review & Approvals
            </h1>
            <Badge
              variant="outline"
              className="text-xs font-semibold border-primary/30 text-primary bg-primary/5"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              AI Guardian Queue
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Review and confirm new vendors, categories, and charges before they are recorded to your
            official general ledger.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by payee, amount or memo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background h-9 text-xs rounded-lg border-border/80"
            />
          </div>
        </div>
      </div>

      {/* Main Client Master-Detail View */}
      <ExceptionListClient searchTerm={searchTerm} />
    </div>
  );
}
