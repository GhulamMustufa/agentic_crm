import { Injectable, Optional } from '@nestjs/common';
import OpenAI from 'openai';

import { AppConfigService } from '../config/config.service';
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
    try {
      if (request.documentTextOrImageBase64.startsWith('data:image/')) {
        const base64Part = request.documentTextOrImageBase64.split(',')[1];
        if (base64Part) {
          try {
            const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
            const jsonStart = decoded.indexOf('{');
            const jsonEnd = decoded.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd > jsonStart) {
              const jsonStr = decoded.slice(jsonStart, jsonEnd + 1);
              const parsed = JSON.parse(jsonStr);
              const validated = request.schema.parse(parsed);
              return { data: validated, confidence: 0.98, durationMs: 15 };
            }
          } catch {
            // Not a JSON-encoded mock image; fall through to default
          }
        }
      }
      const parsed = JSON.parse(request.documentTextOrImageBase64);
      const validated = request.schema.parse(parsed);
      return { data: validated, confidence: 0.98, durationMs: 15 };
    } catch {
      const defaultData = request.schema.parse({});
      return { data: defaultData, confidence: 0.95, durationMs: 10 };
    }
  }
}

export interface UniversalAiProviderConfig {
  providerName: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
}

@Injectable()
export class UniversalAiProvider implements IAiProvider {
  readonly providerName: string;
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(options: UniversalAiProviderConfig) {
    this.providerName = options.providerName;
    this.defaultModel = options.model || 'gpt-4o-mini';
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
  }

  async generateCompletion(request: AiCompletionRequest): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1000,
    });
    return response.choices[0]?.message?.content || '';
  }

  async extractStructured<T>(
    request: AiStructuredExtractionRequest<T>,
  ): Promise<{ data: T; confidence: number; durationMs: number }> {
    const start = Date.now();
    const isImage = request.documentTextOrImageBase64.startsWith('data:image/');

    const userContent = isImage
      ? [
          {
            type: 'text' as const,
            text: 'Extract all bank statement data from this document image according to the schema.',
          },
          {
            type: 'image_url' as const,
            image_url: {
              url: request.documentTextOrImageBase64,
            },
          },
        ]
      : request.documentTextOrImageBase64;

    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${request.systemPrompt}\nCRITICAL: Respond ONLY with a valid JSON object matching the requested schema.`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'user', content: userContent as any },
      ],
      temperature: 0.1,
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const cleanedContent = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleanedContent);
    const validated = request.schema.parse(parsed);
    const durationMs = Date.now() - start;

    return {
      data: validated,
      confidence: 0.96,
      durationMs,
    };
  }
}

@Injectable()
export class OpenAiProvider extends UniversalAiProvider {
  constructor(apiKey: string) {
    super({ providerName: 'openai', apiKey, model: 'gpt-4o-mini' });
  }
}

@Injectable()
export class AiGatewayService {
  private readonly providers = new Map<string, IAiProvider>();

  constructor(@Optional() private readonly config?: AppConfigService) {
    this.registerProvider(new MockAiProvider());

    // 1. OpenAI
    const openAiKey = (this.config?.get('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY) as
      string | undefined;
    if (openAiKey && !openAiKey.startsWith('mock') && openAiKey.trim().length > 10) {
      try {
        this.registerProvider(new OpenAiProvider(openAiKey.trim()));
      } catch (err) {
        console.warn('Failed to initialize OpenAI provider:', err);
      }
    }

    // 2. DeepSeek (OpenAI-compatible)
    const deepSeekKey = (this.config?.get('DEEPSEEK_API_KEY') ?? process.env.DEEPSEEK_API_KEY) as
      string | undefined;
    if (deepSeekKey && deepSeekKey.trim().length > 10) {
      try {
        this.registerProvider(
          new UniversalAiProvider({
            providerName: 'deepseek',
            apiKey: deepSeekKey.trim(),
            baseURL: 'https://api.deepseek.com',
            model: 'deepseek-chat',
          }),
        );
      } catch (err) {
        console.warn('Failed to initialize DeepSeek provider:', err);
      }
    }

    // 3. Google Gemini (OpenAI-compatible endpoint)
    const geminiKey = (this.config?.get('GEMINI_API_KEY') ?? process.env.GEMINI_API_KEY) as
      string | undefined;
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    if (geminiKey && geminiKey.trim().length > 10) {
      try {
        this.registerProvider(
          new UniversalAiProvider({
            providerName: 'gemini',
            apiKey: geminiKey.trim(),
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            model: geminiModel,
          }),
        );
      } catch (err) {
        console.warn('Failed to initialize Gemini provider:', err);
      }
    }
  }

  registerProvider(provider: IAiProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  getProvider(name?: string): IAiProvider {
    const preferred = name || process.env.AI_PROVIDER || this.config?.get('AI_PROVIDER');
    let target = 'mock';
    if (preferred && this.providers.has(preferred)) {
      target = preferred;
    } else if (this.providers.has('deepseek')) {
      target = 'deepseek';
    } else if (this.providers.has('openai')) {
      target = 'openai';
    } else if (this.providers.has('gemini')) {
      target = 'gemini';
    }

    const provider = this.providers.get(target);
    if (!provider) {
      throw new ExternalServiceError(
        'AI Gateway',
        `Requested provider '${target}' is not registered`,
      );
    }
    return provider;
  }

  async extractStructuredWithFallback<T>(
    request: AiStructuredExtractionRequest<T>,
    providerOrder?: string[],
  ): Promise<{ data: T; confidence: number; durationMs: number; providerUsed: string }> {
    let order = providerOrder;
    if (!order || order.length === 0) {
      const candidates: string[] = [];
      const envPreferred = process.env.AI_PROVIDER || this.config?.get('AI_PROVIDER');
      if (envPreferred && this.providers.has(envPreferred)) {
        candidates.push(envPreferred);
      }
      for (const p of ['deepseek', 'openai', 'gemini', 'mock']) {
        if (this.providers.has(p) && !candidates.includes(p)) {
          candidates.push(p);
        }
      }
      order = candidates;
    }

    let lastError: unknown;

    for (const providerName of order) {
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
