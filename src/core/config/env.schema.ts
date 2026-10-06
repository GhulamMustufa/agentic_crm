import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/agentic_os?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('development_jwt_secret_must_be_overridden_in_prod'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default('development_refresh_secret_must_be_overridden_in_prod'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  STORAGE_DRIVER: z.enum(['memory', 's3']).default('memory'),
  S3_BUCKET: z.string().default('uploads'),
  S3_REGION: z.string().default('ap-southeast-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  AWS_ENDPOINT_URL_S3: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AI_PROVIDER_DEFAULT: z.enum(['gemini', 'claude', 'openai', 'deepseek', 'mock']).default('mock'),
  AI_PROVIDER: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown> = process.env): EnvConfig {
  const merged: Record<string, unknown> = {
    ...rawEnv,
    S3_ENDPOINT: rawEnv.S3_ENDPOINT || rawEnv.AWS_ENDPOINT_URL_S3 || undefined,
    S3_ACCESS_KEY: rawEnv.S3_ACCESS_KEY || rawEnv.AWS_ACCESS_KEY_ID || undefined,
    S3_SECRET_KEY: rawEnv.S3_SECRET_KEY || rawEnv.AWS_SECRET_ACCESS_KEY || undefined,
    S3_REGION: rawEnv.S3_REGION || rawEnv.AWS_REGION || 'ap-southeast-1',
    S3_BUCKET: rawEnv.S3_BUCKET || 'uploads',
  };

  const result = envSchema.safeParse(merged);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`CRITICAL: Environment validation failed:\n${errorDetails}`);
  }
  return result.data;
}
