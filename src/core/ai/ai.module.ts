import { Global, Module } from '@nestjs/common';

import { AiGatewayService, AI_GATEWAY_TOKEN } from './ai-gateway.service';

@Global()
@Module({
  providers: [
    AiGatewayService,
    {
      provide: AI_GATEWAY_TOKEN,
      useExisting: AiGatewayService,
    },
  ],
  exports: [AI_GATEWAY_TOKEN, AiGatewayService],
})
export class AiModule {}
