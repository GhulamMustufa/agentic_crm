'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Lock,
  FileCheck2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LandingHero() {
  return (
    <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/10 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Top Announcement Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/25 bg-primary/5 text-primary text-xs sm:text-sm font-medium mb-6 shadow-xs animate-in fade-in duration-300">
          <Sparkles className="w-3.5 h-3.5" />
          <span>The Autonomous Financial Operating System</span>
          <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-primary/40" />
          <span className="hidden sm:inline-block text-muted-foreground">
            Zero Chatbot Gimmicks
          </span>
        </div>

        {/* Main Value Headline */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.12]">
          Put Your Bookkeeping on Autopilot.{' '}
          <span className="bg-gradient-to-r from-primary via-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Zero Manual Entry.
          </span>
        </h1>

        {/* High-Converting Subheadline */}
        <p className="mt-6 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
          Stop wasting weekends matching bank statements line-by-line and guessing tax categories.
          Upload your PDF bank statements from any bank—our AI agent extracts, cleans, clusters, and
          reconciles your books to an unbreakable General Ledger in minutes.
        </p>

        {/* Dual CTA Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
          <Link href="/register" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto h-12 px-7 text-sm sm:text-base font-semibold shadow-lg shadow-primary/20 gap-2 cursor-pointer"
            >
              <span>Start Free 14-Day Trial</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <a href="#preview" className="w-full sm:w-auto">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto h-12 px-6 text-sm sm:text-base border-border/80 hover:bg-muted/60 cursor-pointer"
            >
              See Live Sneak Peek ↓
            </Button>
          </a>
        </div>

        {/* No Credit Card Required micro-copy */}
        <p className="mt-3 text-xs text-muted-foreground">
          ✓ No credit card required &nbsp;•&nbsp; ✓ Instant 2-minute setup &nbsp;•&nbsp; ✓ Works
          with any bank PDF
        </p>

        {/* Highlight Stats Row */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 w-full max-w-4xl text-left">
          <div className="p-3.5 sm:p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>Turnaround Speed</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
              &lt; 15 mins
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Month-end close (vs 12 days)</p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Smart Clustering</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
              1-Click
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Approve 100+ recurring charges</p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Math Guarantee</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
              100% Strict
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Zero AI ledger hallucination</p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <Lock className="w-3.5 h-3.5 text-primary" />
              <span>Security</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
              AES-256
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Bank-grade tenant encryption</p>
          </div>
        </div>
      </div>
    </section>
  );
}
