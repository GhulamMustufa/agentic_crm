import { describe, it, expect, beforeEach } from 'vitest';

import { MemoryStorageService } from '@/core/storage/storage.service';

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
