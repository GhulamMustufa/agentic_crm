import { Global, Module } from '@nestjs/common';

import { StructuredLoggerService } from './logger.service';

@Global()
@Module({
  providers: [
    {
      provide: StructuredLoggerService,
      useFactory: () => new StructuredLoggerService('App'),
    },
  ],
  exports: [StructuredLoggerService],
})
export class LoggingModule {}
