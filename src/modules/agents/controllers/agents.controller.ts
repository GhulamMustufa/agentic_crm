import { Controller, Post, Body, Req, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { AgentContext } from '../domain/agent-context.interface';
import { BusinessOrchestratorService } from '../services/orchestrator.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly orchestrator: BusinessOrchestratorService) {}

  @Post('execute')
  async executeTask(@Body() body: { prompt: string }, @Req() req: Request) {
    if (!body.prompt) {
      throw new HttpException('Prompt is required', HttpStatus.BAD_REQUEST);
    }

    const tenantHeader = req.headers['x-tenant-id'];
    const userHeader = req.headers['x-user-id'];

    // In a real app, this would be extracted from the authenticated user token (req.user)
    const context: AgentContext = {
      tenantId: typeof tenantHeader === 'string' ? tenantHeader : 'default-tenant',
      userId: typeof userHeader === 'string' ? userHeader : 'system-user',
      roles: ['ACCOUNTANT', 'SYSTEM_ADMIN'], // Mock roles
      correlationId: uuidv4(),
    };

    try {
      const result = await this.orchestrator.orchestrate(body.prompt, context);
      return { result, correlationId: context.correlationId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
