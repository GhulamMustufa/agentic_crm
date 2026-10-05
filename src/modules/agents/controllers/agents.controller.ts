import { Controller, Post, Body, Req, HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { AgentContext } from '../domain/agent-context.interface';
import { BusinessOrchestratorService } from '../services/orchestrator.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly orchestrator: BusinessOrchestratorService) {}

  @Post('execute')
  async executeTask(@Body() body: { prompt: string }, @Req() req: any) {
    if (!body.prompt) {
      throw new HttpException('Prompt is required', HttpStatus.BAD_REQUEST);
    }
    
    // In a real app, this would be extracted from the authenticated user token (req.user)
    const context: AgentContext = {
      tenantId: req.headers['x-tenant-id'] || 'default-tenant',
      userId: req.headers['x-user-id'] || 'system-user',
      roles: ['ACCOUNTANT', 'SYSTEM_ADMIN'], // Mock roles
      correlationId: uuidv4(),
    };

    try {
      const result = await this.orchestrator.orchestrate(body.prompt, context);
      return { result, correlationId: context.correlationId };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
