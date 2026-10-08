'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ExceptionListClient } from './_components/exception-list-client';

export default function ExceptionsPage() {
  const [searchTerm, setSearchTerm] = React.useState('');

  return (
    <div className="flex flex-col min-h-0 md:h-[calc(100vh-8rem)]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exception Center</h1>
          <p className="text-muted-foreground mt-1">Review and approve AI decisions.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search exceptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-background"
            />
          </div>
        </div>
      </div>

      <ExceptionListClient searchTerm={searchTerm} />
    </div>
  );
}
