export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  tenantId?: string;
}

const TOKEN_KEY = 'agentic_os_token';
const REFRESH_TOKEN_KEY = 'agentic_os_refresh_token';
const USER_KEY = 'agentic_os_user';
const TENANT_KEY = 'agentic_os_tenant_id';
const CURRENCY_KEY = 'agentic_os_currency';

export const authStorage = {
  setAuthSession(tokens: { accessToken: string; refreshToken?: string }, user: AuthUser) {
    if (typeof window === 'undefined') return;

    localStorage.setItem(TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (user.tenantId) {
      localStorage.setItem(TENANT_KEY, user.tenantId);
    }

    // Set cookie for Next.js navigation checks
    document.cookie = `token=${tokens.accessToken}; path=/; max-age=604800; SameSite=Lax`;
    if (user.tenantId) {
      document.cookie = `tenantId=${user.tenantId}; path=/; max-age=604800; SameSite=Lax`;
    }
  },

  getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  getAuthUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  getActiveTenantId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TENANT_KEY);
  },

  setActiveTenantId(tenantId: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TENANT_KEY, tenantId);
    document.cookie = `tenantId=${tenantId}; path=/; max-age=604800; SameSite=Lax`;
    const user = this.getAuthUser();
    if (user) {
      user.tenantId = tenantId;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  },

  getTenantCurrency(): string {
    if (typeof window === 'undefined') return 'MYR';
    return localStorage.getItem(CURRENCY_KEY) || 'MYR';
  },

  setTenantCurrency(currency: string) {
    if (typeof window === 'undefined' || !currency) return;
    localStorage.setItem(CURRENCY_KEY, currency.toUpperCase());
  },

  clearAuthSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(CURRENCY_KEY);
    document.cookie = 'token=; path=/; max-age=0';
    document.cookie = 'tenantId=; path=/; max-age=0';
  },

  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(TOKEN_KEY);
  },
};
