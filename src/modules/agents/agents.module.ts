import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProposeJournalEntryTool } from './tools/accountant/propose-journal-entry.tool';
import { AccountantAgent } from './services/accountant.agent';
import { PayrollAgent } from './services/payroll.agent';
import { InventoryAgent } from './services/inventory.agent';
import { BusinessOrchestratorService } from './services/orchestrator.service';
import { AgentsController } from './controllers/agents.controller';

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
