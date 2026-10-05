import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../../audit/services/audit.service';
import { AgentContext } from '../domain/agent-context.interface';

export abstract class BaseTool<Input, Output> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: z.ZodSchema<Input>;
  abstract readonly outputSchema: z.ZodSchema<Output>;
  abstract readonly requiredRoles: string[];

  constructor(protected readonly auditService: AuditService) {}

  async execute(input: unknown, context: AgentContext): Promise<Output> {
    // 1. Authorization
    this.authorize(context);

    // 2. Input Validation
    const parsedInput = this.validateInput(input);

    // 3. Audit Log - Request
    await this.auditService.log({
      tenantId: context.tenantId,
      action: `TOOL_EXECUTION_START_${this.name}`,
      entityType: 'TOOL',
      entityId: this.name,
      actorType: 'AI_AGENT',
      actorId: context.userId,
      correlationId: context.correlationId,
      newState: parsedInput as Record<string, unknown>,
    });

    try {
      // 4. Execution
      const result = await this.performTask(parsedInput, context);

      // 5. Output Validation
      const parsedOutput = this.validateOutput(result);

      // 6. Audit Log - Success
      await this.auditService.log({
        tenantId: context.tenantId,
        action: `TOOL_EXECUTION_SUCCESS_${this.name}`,
        entityType: 'TOOL',
        entityId: this.name,
        actorType: 'AI_AGENT',
        actorId: context.userId,
        correlationId: context.correlationId,
        newState: parsedOutput as Record<string, unknown>,
      });

      return parsedOutput;
    } catch (error: any) {
      // 7. Audit Log - Failure
      await this.auditService.log({
        tenantId: context.tenantId,
        action: `TOOL_EXECUTION_FAILED_${this.name}`,
        entityType: 'TOOL',
        entityId: this.name,
        actorType: 'AI_AGENT',
        actorId: context.userId,
        correlationId: context.correlationId,
        newState: { error: error.message },
      });
      throw error;
    }
  }

  protected abstract performTask(input: Input, context: AgentContext): Promise<Output>;

  private authorize(context: AgentContext) {
    if (this.requiredRoles.length === 0) {return;}
    const hasRole = context.roles.some((role) => this.requiredRoles.includes(role));
    if (!hasRole) {
      throw new UnauthorizedException(`Agent missing required roles for tool ${this.name}`);
    }
  }

  private validateInput(input: unknown): Input {
    const result = this.inputSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException(`Invalid input for tool ${this.name}: ${result.error.message}`);
    }
    return result.data;
  }

  private validateOutput(output: unknown): Output {
    const result = this.outputSchema.safeParse(output);
    if (!result.success) {
      throw new Error(`Invalid output from tool ${this.name}: ${result.error.message}`);
    }
    return result.data;
  }
}
