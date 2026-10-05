import { Global, Module } from '@nestjs/common';

import { MemoryQueueService, QUEUE_SERVICE_TOKEN } from './queue.service';

@Global()
@Module({
  providers: [
    MemoryQueueService,
    {
      provide: QUEUE_SERVICE_TOKEN,
      useExisting: MemoryQueueService,
    },
  ],
  exports: [QUEUE_SERVICE_TOKEN, MemoryQueueService],
})
export class QueueModule {}
