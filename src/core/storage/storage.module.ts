import { Global, Module } from '@nestjs/common';

import { OBJECT_STORAGE_TOKEN, MemoryStorageService, S3StorageService } from './storage.service';
import { AppConfigService } from '../config/config.service';

@Global()
@Module({
  providers: [
    MemoryStorageService,
    S3StorageService,
    {
      provide: OBJECT_STORAGE_TOKEN,
      useFactory: (config: AppConfigService, mem: MemoryStorageService, s3: S3StorageService) => {
        const driver = config.get('STORAGE_DRIVER');
        return driver === 's3' ? s3 : mem;
      },
      inject: [AppConfigService, MemoryStorageService, S3StorageService],
    },
  ],
  exports: [OBJECT_STORAGE_TOKEN, MemoryStorageService],
})
export class StorageModule {}
