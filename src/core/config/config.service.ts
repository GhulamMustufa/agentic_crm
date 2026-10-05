import { Injectable } from '@nestjs/common';

import { type EnvConfig, validateEnv } from './env.schema';

@Injectable()
export class AppConfigService {
  private readonly config: EnvConfig;

  constructor(customEnv?: Record<string, unknown>) {
    this.config = validateEnv(customEnv ?? process.env);
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  get isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }
}
