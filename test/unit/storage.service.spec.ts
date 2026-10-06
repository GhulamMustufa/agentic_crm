import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AppConfigService } from '@/core/config/config.service';
import { MemoryStorageService, S3StorageService } from '@/core/storage/storage.service';

describe('MemoryStorageService', () => {
  let storage: MemoryStorageService;

  beforeEach(() => {
    storage = new MemoryStorageService();
  });

  it('should store and retrieve an object', async () => {
    const data = Buffer.from('PDF Bank Statement Content');
    await storage.putObject('tenants/t1/statements/s1.pdf', data, {
      contentType: 'application/pdf',
    });

    expect(await storage.hasObject('tenants/t1/statements/s1.pdf')).toBe(true);

    const retrieved = await storage.getObject('tenants/t1/statements/s1.pdf');
    expect(retrieved.toString()).toBe('PDF Bank Statement Content');
  });

  it('should throw error when getting non-existent object', async () => {
    await expect(storage.getObject('does-not-exist.pdf')).rejects.toThrow();
  });

  it('should delete an object', async () => {
    await storage.putObject('doc.txt', Buffer.from('hello'));
    expect(await storage.hasObject('doc.txt')).toBe(true);

    await storage.deleteObject('doc.txt');
    expect(await storage.hasObject('doc.txt')).toBe(false);
  });
});

describe('S3StorageService', () => {
  let config: AppConfigService;
  let s3Storage: S3StorageService;

  beforeEach(() => {
    config = new AppConfigService({
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'uploads',
      S3_REGION: 'ap-southeast-1',
      S3_ENDPOINT: 'https://mock.storage.neon.tech',
      S3_ACCESS_KEY: 'mock_access_key',
      S3_SECRET_KEY: 'mock_secret_key',
    });
    s3Storage = new S3StorageService(config);
  });

  it('should instantiate S3StorageService with configuration', () => {
    expect(s3Storage).toBeDefined();
  });

  it('should execute putObject via S3 client', async () => {
    const sendMock = vi.fn().mockResolvedValue({});
    (s3Storage as unknown as { client: { send: unknown } }).client.send = sendMock;

    await s3Storage.putObject('tenant1/statements/doc.pdf', Buffer.from('PDF DATA'), {
      contentType: 'application/pdf',
    });

    expect(sendMock).toHaveBeenCalled();
  });

  it('should execute getObject and transform to Buffer', async () => {
    const mockByteArray = new Uint8Array(Buffer.from('Retrieved S3 Object'));
    const sendMock = vi.fn().mockResolvedValue({
      Body: {
        transformToByteArray: async () => mockByteArray,
      },
    });
    (s3Storage as unknown as { client: { send: unknown } }).client.send = sendMock;

    const result = await s3Storage.getObject('tenant1/statements/doc.pdf');
    expect(sendMock).toHaveBeenCalled();
    expect(result.toString()).toBe('Retrieved S3 Object');
  });

  it('should return false when hasObject encounters NotFound 404', async () => {
    const sendMock = vi.fn().mockRejectedValue({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });
    (s3Storage as unknown as { client: { send: unknown } }).client.send = sendMock;

    const exists = await s3Storage.hasObject('tenant1/nonexistent.pdf');
    expect(exists).toBe(false);
  });

  it('should execute deleteObject via S3 client', async () => {
    const sendMock = vi.fn().mockResolvedValue({});
    (s3Storage as unknown as { client: { send: unknown } }).client.send = sendMock;

    await s3Storage.deleteObject('tenant1/statements/doc.pdf');
    expect(sendMock).toHaveBeenCalled();
  });
});
