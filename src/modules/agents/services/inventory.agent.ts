import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from '../domain/base-agent';
import { AgentContext } from '../domain/agent-context.interface';

@Injectable()
export class InventoryAgent extends BaseAgent {
  readonly name = 'inventory_agent';
  readonly description = 'Specialist agent for handling stock, products, and inventory valuation.';
  private readonly logger = new Logger(InventoryAgent.name);

  constructor() {
    super([]); // Add tools later
  }

  async executeTask(prompt: string, context: AgentContext): Promise<string> {
    this.logger.log(`Inventory agent executing task for tenant ${context.tenantId}: ${prompt}`);
    return `Inventory Agent has processed the task: ${prompt}`;
  }
}
