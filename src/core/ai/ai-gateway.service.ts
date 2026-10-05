import { Injectable } from '@nestjs/common';

import { ExternalServiceError } from '../errors/app-error';

import type { z } from 'zod';

export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiStructuredExtractionRequest<T> {
  systemPrompt: string;
  documentTextOrImageBase64: string;
  schema: z.ZodSchema<T>;
  timeoutMs?: number;
}

export interface IAiProvider {
  readonly providerName: string;
  generateCompletion(request: AiCompletionRequest): Promise<string>;
  extractStructured<T>(
    request: AiStructuredExtractionRequest<T>,
  ): Promise<{ data: T; confidence: number; durationMs: number }>;
}

export const AI_GATEWAY_TOKEN = Symbol('IAiGateway');

@Injectable()
export class MockAiProvider implements IAiProvider {
  readonly providerName = 'mock';

  async generateCompletion(request: AiCompletionRequest): Promise<string> {
    return `Mock completion for: ${request.userPrompt.substring(0, 50)}`;
  }

  async extractStructured<T>(
    request: AiStructuredExtractionRequest<T>,
  ): Promise<{ data: T; confidence: number; durationMs: number }> {
    // Generate empty mock or parse from input if stringified JSON
    try {
      const parsed = JSON.parse(request.documentTextOrImageBase64);
      const validated = request.schema.parse(parsed);
      return { data: validated, confidence: 0.98, durationMs: 15 };
    } catch {
      // Return safe mock default
      const defaultData = request.schema.parse({});
      return { data: defaultData, confidence: 0.95, durationMs: 10 };
    }
  }
}

@Injectable()
export class AiGatewayService {
  private readonly providers = new Map<string, IAiProvider>();

  constructor() {
    this.registerProvider(new MockAiProvider());
  }

  registerProvider(provider: IAiProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  getProvider(name = 'mock'): IAiProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ExternalServiceError(
        'AI Gateway',
        `Requested provider '${name}' is not registered`,
      );
    }
    return provider;
  }

  async extractStructuredWithFallback<T>(
    request: AiStructuredExtractionRequest<T>,
    providerOrder: string[] = ['mock'],
  ): Promise<{ data: T; confidence: number; durationMs: number; providerUsed: string }> {
    let lastError: unknown;

    for (const providerName of providerOrder) {
      try {
        const provider = this.getProvider(providerName);
        const result = await provider.extractStructured(request);
        return { ...result, providerUsed: providerName };
      } catch (err) {
        lastError = err;
      }
    }

    throw new ExternalServiceError(
      'AI Gateway',
      `All AI extraction providers failed: ${lastError}`,
    );
  }
}
