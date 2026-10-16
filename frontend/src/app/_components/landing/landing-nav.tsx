'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, LayoutDashboard, Sparkles } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { authStorage } from '@/lib/auth-storage';

export function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  React.useEffect(() => {
    setIsLoggedIn(authStorage.isAuthenticated());
  }, []);

  const navLinks = [
    { name: 'Features', href: '#features' },
    { name: 'Vs QuickBooks', href: '#comparison' },
    { name: 'How It Works', href: '#how-it-works' },
    { name: 'ROI Calculator', href: '#roi-calculator' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Name */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <BrandLogo size={30} className="shadow-xs group-hover:scale-105 transition-transform" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-base sm:text-lg tracking-tight text-foreground">
              Agentic OS
            </span>
            <span className="hidden sm:inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3 h-3 mr-1" />
              Autonomous Finance
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          {navLinks.map((link) => (
            <a key={link.name} href={link.href} className="hover:text-foreground transition-colors">
              {link.name}
            </a>
          ))}
        </nav>

        {/* Right CTA Actions */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {isLoggedIn ? (
            <Link href="/overview">
              <Button size="sm" className="gap-1.5 h-9 font-semibold shadow-xs">
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Go to Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          ) : (
            <div className="hidden sm:flex items-center gap-2.5">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="h-9 text-xs sm:text-sm font-medium">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button
                  size="sm"
                  className="h-9 text-xs sm:text-sm font-semibold shadow-xs gap-1.5"
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile Menu Hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border/80 bg-background/95 backdrop-blur-lg px-4 pt-3 pb-6 animate-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col space-y-3 pb-4 border-b border-border/60">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors py-1"
              >
                {link.name}
              </a>
            ))}
          </nav>

          <div className="pt-4 flex flex-col gap-2.5">
            {isLoggedIn ? (
              <Link href="/overview" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full gap-2">
                  <LayoutDashboard className="w-4 h-4" />
                  Go to Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full font-semibold">
                    Start Free Trial — No Card Needed
                  </Button>
                </Link>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full">
                    Sign In to Account
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
