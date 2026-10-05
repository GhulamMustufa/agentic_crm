import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

import { AiGatewayService, MockAiProvider, type IAiProvider } from '@/core/ai/ai-gateway.service';
import { ExternalServiceError } from '@/core/errors/app-error';

describe('AiGatewayService', () => {
  let gateway: AiGatewayService;

  beforeEach(() => {
    gateway = new AiGatewayService();
  });

  it('should extract structured data using default mock provider', async () => {
    const testSchema = z.object({
      merchant: z.string().default('GitHub'),
      amount: z.number().default(42),
    });

    const result = await gateway.extractStructuredWithFallback({
      systemPrompt: 'Extract transaction',
      documentTextOrImageBase64: '{"merchant": "AWS", "amount": 100}',
      schema: testSchema,
    });

    expect(result.data.merchant).toBe('AWS');
    expect(result.data.amount).toBe(100);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.providerUsed).toBe('mock');
  });

  it('should fall back to next provider when primary provider fails', async () => {
    class FailingProvider implements IAiProvider {
      readonly providerName = 'failing-primary';
      async generateCompletion(): Promise<string> {
        throw new Error('API Rate Limit 429');
      }
      async extractStructured<T>(): Promise<{ data: T; confidence: number; durationMs: number }> {
        throw new Error('Provider connection timeout');
      }
    }

    gateway.registerProvider(new FailingProvider());
    gateway.registerProvider(new MockAiProvider());

    const schema = z.object({ status: z.string().default('OK') });
    const result = await gateway.extractStructuredWithFallback(
      {
        systemPrompt: 'Test',
        documentTextOrImageBase64: '{}',
        schema,
      },
      ['failing-primary', 'mock'],
    );

    expect(result.providerUsed).toBe('mock');
    expect(result.data.status).toBe('OK');
  });

  it('should throw ExternalServiceError if all fallback providers fail', async () => {
    class DeadProvider implements IAiProvider {
      readonly providerName = 'dead';
      async generateCompletion(): Promise<string> {
        throw new Error('Dead');
      }
      async extractStructured<T>(): Promise<{ data: T; confidence: number; durationMs: number }> {
        throw new Error('Service Unavailable 503');
      }
    }

    gateway.registerProvider(new DeadProvider());

    const schema = z.object({});
    await expect(
      gateway.extractStructuredWithFallback(
        {
          systemPrompt: 'Test',
          documentTextOrImageBase64: '{}',
          schema,
        },
        ['dead'],
      ),
    ).rejects.toThrow(ExternalServiceError);
  });
});
