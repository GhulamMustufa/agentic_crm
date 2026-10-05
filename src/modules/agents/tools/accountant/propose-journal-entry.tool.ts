import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../../../audit/services/audit.service';
import { AgentContext } from '../../domain/agent-context.interface';
import { BaseTool } from '../base-tool';

const ProposeJournalEntryInputSchema = z.object({
  description: z.string().min(1),
  date: z.string().datetime(),
  lines: z.array(
    z.object({
      accountId: z.string().uuid(),
      amount: z.number().int().positive(), // in cents
      type: z.enum(['DEBIT', 'CREDIT']),
    })
  ).min(2),
});

const ProposeJournalEntryOutputSchema = z.object({
  success: z.boolean(),
  proposalId: z.string().uuid(),
  message: z.string(),
});

type Input = z.infer<typeof ProposeJournalEntryInputSchema>;
type Output = z.infer<typeof ProposeJournalEntryOutputSchema>;

@Injectable()
export class ProposeJournalEntryTool extends BaseTool<Input, Output> {
  readonly name = 'propose_journal_entry';
  readonly description = 'Proposes a new journal entry for human review based on extracted data.';
  readonly inputSchema = ProposeJournalEntryInputSchema;
  readonly outputSchema = ProposeJournalEntryOutputSchema;
  readonly requiredRoles = ['ACCOUNTANT', 'SYSTEM_ADMIN'];

  constructor(auditService: AuditService) {
    super(auditService);
  }

  protected async performTask(input: Input, _context: AgentContext): Promise<Output> {
    // In a real implementation, this would call LedgerService or a ProposalService
    // to save the draft entry and create an exception/approval request for humans.
    
    // Validate that debits == credits
    let debits = 0;
    let credits = 0;
    for (const line of input.lines) {
      if (line.type === 'DEBIT') {debits += line.amount;}
      if (line.type === 'CREDIT') {credits += line.amount;}
    }
    
    if (debits !== credits) {
      throw new Error('Deterministic validation failed: Debits must equal Credits');
    }

    // Mock proposal ID
    const proposalId = '00000000-0000-0000-0000-000000000000'; // crypto.randomUUID() could be used
    
    return {
      success: true,
      proposalId,
      message: 'Journal entry proposed successfully. Awaiting human approval.',
    };
  }
}
