import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/config.service';

export interface PutObjectOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface IObjectStorage {
  putObject(key: string, data: Buffer | Uint8Array, options?: PutObjectOptions): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  hasObject(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const OBJECT_STORAGE_TOKEN = Symbol('IObjectStorage');

@Injectable()
export class MemoryStorageService implements IObjectStorage {
  private readonly store = new Map<
    string,
    { data: Buffer; contentType?: string; metadata?: Record<string, string> }
  >();

  async putObject(
    key: string,
    data: Buffer | Uint8Array,
    options?: PutObjectOptions,
  ): Promise<void> {
    this.store.set(key, {
      data: Buffer.isBuffer(data) ? data : Buffer.from(data),
      contentType: options?.contentType,
      metadata: options?.metadata,
    });
  }

  async getObject(key: string): Promise<Buffer> {
    const item = this.store.get(key);
    if (!item) {
      throw new Error(`Object not found in memory storage: ${key}`);
    }
    return item.data;
  }

  async hasObject(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getPresignedUrl(key: string, _expiresInSeconds = 900): Promise<string> {
    return `https://mock-storage.local/${key}?mock-token=${Date.now()}`;
  }

  clear(): void {
    this.store.clear();
  }
}

@Injectable()
export class S3StorageService implements IObjectStorage {
  constructor(private readonly config: AppConfigService) {}

  async putObject(
    key: string,
    data: Buffer | Uint8Array,
    _options?: PutObjectOptions,
  ): Promise<void> {
    // S3 client integration point
    void key;
    void data;
  }

  async getObject(key: string): Promise<Buffer> {
    void key;
    return Buffer.from('');
  }

  async hasObject(key: string): Promise<boolean> {
    void key;
    return true;
  }

  async deleteObject(key: string): Promise<void> {
    void key;
  }

  async getPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const bucket = this.config.get('S3_BUCKET');
    return `https://${bucket}.s3.${this.config.get('S3_REGION')}.amazonaws.com/${key}?expires=${expiresInSeconds}`;
  }
}
