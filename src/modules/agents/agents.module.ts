import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AgentsController } from './controllers/agents.controller';
import { AccountantAgent } from './services/accountant.agent';
import { InventoryAgent } from './services/inventory.agent';
import { BusinessOrchestratorService } from './services/orchestrator.service';
import { PayrollAgent } from './services/payroll.agent';
import { ProposeJournalEntryTool } from './tools/accountant/propose-journal-entry.tool';

@Module({
  imports: [AuditModule],
  controllers: [AgentsController],
  providers: [
    ProposeJournalEntryTool,
    AccountantAgent,
    PayrollAgent,
    InventoryAgent,
    BusinessOrchestratorService,
  ],
  exports: [BusinessOrchestratorService],
})
export class AgentsModule {}
