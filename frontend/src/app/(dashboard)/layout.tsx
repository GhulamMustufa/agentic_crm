'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CheckCircle,
  Building2,
  Receipt,
  FileText,
  BarChart3,
  Menu,
  X,
  Bot,
  LogOut,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { authStorage, AuthUser } from '@/lib/auth-storage';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Exceptions', href: '/exceptions', icon: CheckCircle },
  { name: 'Banking', href: '/banking', icon: Building2 },
  { name: 'Transactions', href: '/transactions', icon: Receipt },
  { name: 'Invoices', href: '/invoices', icon: FileText },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState<AuthUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = React.useState(true);

  React.useEffect(() => {
    if (!authStorage.isAuthenticated()) {
      router.push('/login');
    } else {
      setCurrentUser(authStorage.getAuthUser());
      setIsCheckingAuth(false);
    }
  }, [router]);

  const handleLogout = () => {
    authStorage.clearAuthSession();
    router.push('/login');
  };

  if (isCheckingAuth) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <Bot className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted/20">
      {/* Mobile sidebar */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity ${mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-background border-r flex flex-col transition-transform transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center h-16 px-4 border-b shrink-0">
          <Bot className="w-6 h-6 mr-2 text-primary" />
          <span className="font-semibold tracking-tight">Agentic OS</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-64 border-r bg-background shrink-0">
        <div className="flex items-center h-16 px-6 border-b shrink-0">
          <Bot className="w-6 h-6 mr-2 text-primary" />
          <span className="font-semibold tracking-tight">Agentic OS</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium shrink-0">
                {currentUser?.fullName
                  ? currentUser.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : 'US'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium leading-none truncate">
                  {currentUser?.fullName || 'Active User'}
                </span>
                <span className="text-xs text-muted-foreground mt-1 truncate">
                  {currentUser?.email || 'Admin'}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground shrink-0 h-8 w-8"
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content wrapper */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center h-16 px-4 md:px-6 border-b bg-background shrink-0 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
