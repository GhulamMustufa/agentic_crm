import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AgentContext } from '../../src/modules/agents/domain/agent-context.interface';
import { ProposeJournalEntryTool } from '../../src/modules/agents/tools/accountant/propose-journal-entry.tool';
import { AuditService } from '../../src/modules/audit/services/audit.service';

describe('ProposeJournalEntryTool', () => {
  let tool: ProposeJournalEntryTool;
  let auditService: AuditService;

  beforeEach(() => {
    // Mock AuditService
    auditService = {
      log: vi.fn().mockResolvedValue(true),
    } as unknown as AuditService;

    tool = new ProposeJournalEntryTool(auditService);
  });

  const validContext: AgentContext = {
    tenantId: 'tenant-1',
    userId: 'agent-1',
    roles: ['ACCOUNTANT'],
    correlationId: 'corr-1',
  };

  it('should successfully propose a journal entry when debits equal credits', async () => {
    const input = {
      description: 'Test entry',
      date: new Date().toISOString(),
      lines: [
        { accountId: uuidv4(), amount: 1000, type: 'DEBIT' },
        { accountId: uuidv4(), amount: 1000, type: 'CREDIT' },
      ],
    };

    const result = await tool.execute(input, validContext);
    
    expect(result.success).toBe(true);
    expect(result.proposalId).toBeDefined();
    expect(auditService.log).toHaveBeenCalledTimes(2); // START and SUCCESS
  });

  it('should reject execution if user lacks required roles', async () => {
    const invalidContext: AgentContext = {
      ...validContext,
      roles: ['GUEST'],
    };

    const input = {
      description: 'Test entry',
      date: new Date().toISOString(),
      lines: [
        { accountId: uuidv4(), amount: 1000, type: 'DEBIT' },
        { accountId: uuidv4(), amount: 1000, type: 'CREDIT' },
      ],
    };

    await expect(tool.execute(input, invalidContext)).rejects.toThrow(UnauthorizedException);
    expect(auditService.log).not.toHaveBeenCalled(); // Failed before execution
  });

  it('should reject execution if input schema validation fails', async () => {
    const input = {
      description: '', // invalid, min length 1
      date: new Date().toISOString(),
      lines: [],
    };

    await expect(tool.execute(input, validContext)).rejects.toThrow(BadRequestException);
  });

  it('should throw an error if debits do not equal credits (Accounting Invariant)', async () => {
    const input = {
      description: 'Unbalanced entry',
      date: new Date().toISOString(),
      lines: [
        { accountId: uuidv4(), amount: 1000, type: 'DEBIT' },
        { accountId: uuidv4(), amount: 500, type: 'CREDIT' },
      ],
    };

    await expect(tool.execute(input, validContext)).rejects.toThrow(/Debits must equal Credits/);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.stringContaining('FAILED'),
    }));
  });
});
