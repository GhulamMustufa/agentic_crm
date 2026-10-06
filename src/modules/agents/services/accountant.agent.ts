import { Inject, Injectable, Logger } from '@nestjs/common';

import { AgentContext } from '../domain/agent-context.interface';
import { BaseAgent } from '../domain/base-agent';
import { ProposeJournalEntryTool } from '../tools/accountant/propose-journal-entry.tool';

@Injectable()
export class AccountantAgent extends BaseAgent {
  readonly name = 'accountant_agent';
  readonly description =
    'Specialist agent for handling financial operations, journal entries, and reconciliations.';
  private readonly logger = new Logger(AccountantAgent.name);

  constructor(
    @Inject(ProposeJournalEntryTool)
    proposeJournalEntryTool: ProposeJournalEntryTool,
  ) {
    super(proposeJournalEntryTool ? [proposeJournalEntryTool] : []);
  }

  async executeTask(prompt: string, context: AgentContext): Promise<string> {
    this.logger.log(`Accountant agent executing task for tenant ${context.tenantId}: ${prompt}`);

    // In a full implementation, we'd interact with an LLM here (e.g. Gemini 3.1 Pro),
    // providing it with `this.getTools()` and letting it decide which to call.
    // The framework enforces that when it *does* call a tool, we run it through
    // `tool.execute(input, context)` which enforces validation, auth, and audit.

    return `Accountant Agent has processed the task: ${prompt}`;
  }
}
