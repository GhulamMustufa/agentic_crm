import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from '../domain/base-agent';
import { AgentContext } from '../domain/agent-context.interface';

@Injectable()
export class PayrollAgent extends BaseAgent {
  readonly name = 'payroll_agent';
  readonly description = 'Specialist agent for handling payroll runs, deductions, and employee compensation.';
  private readonly logger = new Logger(PayrollAgent.name);

  constructor() {
    super([]); // Add tools later
  }

  async executeTask(prompt: string, context: AgentContext): Promise<string> {
    this.logger.log(`Payroll agent executing task for tenant ${context.tenantId}: ${prompt}`);
    return `Payroll Agent has processed the task: ${prompt}`;
  }
}
