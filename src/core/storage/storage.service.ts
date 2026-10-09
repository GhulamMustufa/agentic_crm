import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Inject } from '@nestjs/common';

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
  getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<string>;
}

export const OBJECT_STORAGE_TOKEN = Symbol('IObjectStorage');

@Injectable()
export class MemoryStorageService implements IObjectStorage {
  private readonly store = new Map<
    string,
    { data: Buffer; contentType?: string; metadata?: Record<string, string> }
  >();

  constructor(
    @Inject(AppConfigService)
    private readonly config?: AppConfigService,
  ) {}

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

  private getBaseUrl(): string {
    const port = this.config?.get('PORT') || 4000;
    return `http://localhost:${port}/api/v1`;
  }

  async getPresignedUrl(key: string, _expiresInSeconds = 900): Promise<string> {
    return `${this.getBaseUrl()}/storage/download/${encodeURIComponent(key)}`;
  }

  async getPresignedUploadUrl(
    key: string,
    _contentType: string,
    _expiresInSeconds = 900,
  ): Promise<string> {
    return `${this.getBaseUrl()}/storage/upload/${encodeURIComponent(key)}`;
  }

  clear(): void {
    this.store.clear();
  }
}

@Injectable()
export class S3StorageService implements IObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.bucket = this.config.get('S3_BUCKET') || 'uploads';
    const endpoint =
      this.config.get('S3_ENDPOINT') || this.config.get('AWS_ENDPOINT_URL_S3') || undefined;
    const region =
      this.config.get('S3_REGION') || this.config.get('AWS_REGION') || 'ap-southeast-1';
    const accessKeyId = this.config.get('S3_ACCESS_KEY') || this.config.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey =
      this.config.get('S3_SECRET_KEY') || this.config.get('AWS_SECRET_ACCESS_KEY');

    this.client = new S3Client({
      region,
      endpoint,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
      forcePathStyle: true, // Required for Neon Object Storage & MinIO path-style addressing
    });
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array,
    options?: PutObjectOptions,
  ): Promise<void> {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
    });
    await this.client.send(command);
  }

  async getObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty body returned for object: ${key}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async hasObject(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        ('name' in err || '$metadata' in err) &&
        ((err as { name?: string }).name === 'NotFound' ||
          (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
      ) {
        return false;
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  async getPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
