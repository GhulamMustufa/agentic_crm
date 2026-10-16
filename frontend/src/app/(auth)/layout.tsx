'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Button } from '@/components/ui/button';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      {/* Top Navigation Header */}
      <header className="w-full h-16 border-b border-border/60 bg-background/80 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2.5 group cursor-pointer"
          title="Back to Agentic OS Home"
        >
          <BrandLogo size={28} className="shadow-xs group-hover:scale-105 transition-transform" />
          <span className="font-bold text-base tracking-tight text-foreground">Agentic OS</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs sm:text-sm text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Button>
          </Link>
          <div className="w-px h-4 bg-border/80" />
          <ThemeToggle />
        </div>
      </header>

      {/* Auth Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-md animate-in fade-in duration-200">{children}</div>
      </main>

      {/* Subtle Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-border/40">
        © {new Date().getFullYear()} Agentic Business OS. All rights reserved.
      </footer>
    </div>
  );
}
