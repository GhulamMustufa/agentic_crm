import { toast } from 'sonner';
import { authStorage } from './auth-storage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
  silent?: boolean;
}

export class ApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

function extractReadableError(errorData: unknown, status: number, statusText: string): string {
  if (status >= 500) {
    return 'An unexpected server error occurred. Our team has been notified.';
  }

  if (typeof errorData === 'object' && errorData !== null) {
    const data = errorData as Record<string, unknown>;

    if (Array.isArray(data.message)) {
      return data.message.map((msg: string) => `• ${msg}`).join('\n');
    }

    if (typeof data.message === 'string') {
      if (data.message.includes('P2002') || data.code === 'P2002') {
        return 'This record already exists. Please use a different value.';
      }
      return data.message;
    }
  }

  return statusText || 'An error occurred. Please try again.';
}

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token as string);
    }
  });
  failedQueue = [];
};

export const apiClient = {
  async fetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers, ...customConfig } = options;

    let url = `${API_BASE_URL}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
      url += `?${searchParams.toString()}`;
    }

    const token = authStorage.getAuthToken();
    const tenantId = authStorage.getActiveTenantId();

    const authHeaders: Record<string, string> = {};
    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`;
    }
    if (tenantId) {
      authHeaders['x-tenant-id'] = tenantId;
    }

    const config: RequestInit = {
      ...customConfig,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...headers,
      },
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (netErr) {
      const msg = 'Unable to connect to backend server. Please check server availability.';
      if (!options.silent) {
        toast.error(msg);
      }
      throw new ApiError(msg, 0, netErr);
    }

    if (!response.ok) {
      if (response.status === 401 && typeof window !== 'undefined') {
        const refreshToken = authStorage.getRefreshToken();
        const isAuthEndpoint = endpoint.startsWith('/auth/');

        if (refreshToken && !isAuthEndpoint) {
          if (!isRefreshing) {
            isRefreshing = true;

            try {
              const refreshResponse = await window.fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
              });

              if (!refreshResponse.ok) {
                throw new Error('Refresh failed');
              }

              const refreshData = await refreshResponse.json();
              authStorage.setAuthSession(refreshData.data.tokens, refreshData.data.user);

              processQueue(null, refreshData.data.tokens.accessToken);

              // Retry the original request
              return this.fetch<T>(endpoint, options);
            } catch (err) {
              processQueue(err, null);
              authStorage.clearAuthSession();
              if (!window.location.pathname.startsWith('/login')) {
                window.location.href = '/login?expired=true';
              }
              throw new ApiError('Session expired', 401, null);
            } finally {
              isRefreshing = false;
            }
          } else {
            // Already refreshing, queue the request
            return new Promise<T>((resolve, reject) => {
              failedQueue.push({
                resolve: () => resolve(this.fetch<T>(endpoint, options)),
                reject: (err) => reject(err),
              });
            });
          }
        } else {
          // No refresh token or we are already on an auth endpoint
          authStorage.clearAuthSession();
          if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login?expired=true';
          }
        }
      }

      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }

      const message = extractReadableError(errorData, response.status, response.statusText);

      if (response.status !== 401 && !options.silent) {
        toast.error(message);
      }
      throw new ApiError(message, response.status, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  },

  get<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
  },

  put<T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
  },

  patch<T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });
  },

  delete<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'DELETE' });
  },
};
