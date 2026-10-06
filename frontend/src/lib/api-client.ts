/**
 * Base API Client for communicating with the NestJS Backend.
 * Handles base URLs, standard headers, and error formatting.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

class ApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

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

    const config: RequestInit = {
      ...customConfig,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: 'An unexpected error occurred' };
      }
      const message =
        typeof errorData === 'object' && errorData !== null && 'message' in errorData
          ? String((errorData as { message: unknown }).message)
          : response.statusText;
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
