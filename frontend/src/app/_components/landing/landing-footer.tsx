'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck, Heart } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export function LandingFooter() {
  return (
    <footer className="bg-background border-t border-border/70">
      {/* High-Impact Closing CTA Banner */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="relative rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-transparent border border-primary/25 p-8 sm:p-12 text-center overflow-hidden">
          <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              14-Day Risk-Free Trial
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Ready to Close Your Books in 15 Minutes?
            </h2>
            <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              Stop spending your precious weekends on tedious accounting. Join hundreds of growing
              companies that trust Agentic OS for autonomous financial peace of mind.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Link href="/register" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 px-8 font-semibold shadow-lg gap-2 cursor-pointer"
                >
                  <span>Start Free 14-Day Trial</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/login" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto h-12 px-6 cursor-pointer"
                >
                  Sign In to Account
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              No credit card required &nbsp;•&nbsp; Setup in 2 minutes &nbsp;•&nbsp; Cancel anytime
            </p>
          </div>
        </div>

        {/* Links & Brand Bar */}
        <div className="mt-14 pt-8 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <BrandLogo size={24} />
            <span className="font-bold text-sm text-foreground">Agentic Business OS</span>
            <span>© {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#comparison" className="hover:text-foreground transition-colors">
              Vs QuickBooks
            </a>
            <a href="#roi-calculator" className="hover:text-foreground transition-colors">
              ROI Calculator
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
            <Link href="/login" className="hover:text-foreground transition-colors font-medium">
              Sign In
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
