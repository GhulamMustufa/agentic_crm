import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { AccountantAgent } from './accountant.agent';
import { InventoryAgent } from './inventory.agent';
import { PayrollAgent } from './payroll.agent';
import { AgentContext } from '../domain/agent-context.interface';

@Injectable()
export class BusinessOrchestratorService {
  private readonly logger = new Logger(BusinessOrchestratorService.name);

  constructor(
    private readonly accountantAgent: AccountantAgent,
    private readonly payrollAgent: PayrollAgent,
    private readonly inventoryAgent: InventoryAgent,
  ) {}

  async orchestrate(prompt: string, context: AgentContext): Promise<string> {
    this.logger.log(`Orchestrating task for tenant ${context.tenantId}: ${prompt}`);
    
    // In a real implementation, the LLM determines the domain and routes to the correct specialist.
    // For this demonstration, we'll route based on keyword matching to the AccountantAgent.
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('journal') || lowerPrompt.includes('invoice') || lowerPrompt.includes('payment')) {
      return this.accountantAgent.executeTask(prompt, context);
    } else if (lowerPrompt.includes('payroll') || lowerPrompt.includes('employee')) {
      return this.payrollAgent.executeTask(prompt, context);
    } else if (lowerPrompt.includes('inventory') || lowerPrompt.includes('stock')) {
      return this.inventoryAgent.executeTask(prompt, context);
    }
    
    throw new BadRequestException('Orchestrator could not determine appropriate specialist agent for task.');
  }
}
