import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { AuthorizationError } from '../../../core/errors/app-error';
import { CurrentUser } from '../../../core/security/decorators/auth.decorators';
import { JwtAuthGuard } from '../../../core/security/guards/jwt-auth.guard';
import { BankProcessingService } from '../services/bank-processing.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type { BankTransactionStatus } from '../domain/bank-transaction.entity';
import type { ExceptionSeverity, ExceptionStatus } from '../domain/exception-item.entity';
import type { ProposalStatus } from '../domain/proposal.entity';
import type {
  CreateBankAccountInput,
  UploadStatementInput,
  CorrectProposalInput,
  RejectProposalInput,
  ResolveExceptionInput,
} from '../dto/banking.dto';

function serializeBigInt(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serializeBigInt(v)]));
  }
  return obj;
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/banking')
export class BankingController {
  constructor(private readonly bankProcessingService: BankProcessingService) {}

  private requireTenant(user: TenantSessionContext): string {
    if (!user.tenantId) {
      throw new AuthorizationError('Tenant context required for banking operations');
    }
    return user.tenantId;
  }

  // --- Bank Accounts ---
  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  async createBankAccount(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: CreateBankAccountInput,
  ) {
    const tenantId = this.requireTenant(user);
    const account = await this.bankProcessingService.createBankAccount(tenantId, user.userId, dto);
    return { data: serializeBigInt(account) };
  }

  @Get('accounts')
  @HttpCode(HttpStatus.OK)
  async listBankAccounts(@CurrentUser() user: TenantSessionContext) {
    const tenantId = this.requireTenant(user);
    const accounts = await this.bankProcessingService.listBankAccounts(tenantId);
    return { data: serializeBigInt(accounts) };
  }

  // --- Bank Statements ---
  @Post('statements/upload')
  @HttpCode(HttpStatus.CREATED)
  async uploadStatement(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: UploadStatementInput,
  ) {
    const tenantId = this.requireTenant(user);
    const result = await this.bankProcessingService.processStatementUpload(
      tenantId,
      user.userId,
      dto,
    );
    return { data: serializeBigInt(result) };
  }

  @Get('statements')
  @HttpCode(HttpStatus.OK)
  async listStatements(
    @CurrentUser() user: TenantSessionContext,
    @Query('bankAccountId') bankAccountId?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const statements = await this.bankProcessingService.listStatements(tenantId, bankAccountId);
    return { data: serializeBigInt(statements) };
  }

  @Post('statements/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retryStatement(@CurrentUser() user: TenantSessionContext, @Param('id') id: string) {
    const tenantId = this.requireTenant(user);
    const result = await this.bankProcessingService.retryStatementProcessing(
      tenantId,
      user.userId,
      id,
    );
    return { data: serializeBigInt(result) };
  }

  // --- Transactions ---
  @Get('transactions')
  @HttpCode(HttpStatus.OK)
  async listTransactions(
    @CurrentUser() user: TenantSessionContext,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: BankTransactionStatus,
  ) {
    const tenantId = this.requireTenant(user);
    const transactions = await this.bankProcessingService.listTransactions(tenantId, {
      bankAccountId,
      status,
    });
    return { data: serializeBigInt(transactions) };
  }

  // --- Proposals ---
  @Get('proposals')
  @HttpCode(HttpStatus.OK)
  async listProposals(
    @CurrentUser() user: TenantSessionContext,
    @Query('status') status?: ProposalStatus,
  ) {
    const tenantId = this.requireTenant(user);
    const proposals = await this.bankProcessingService.listProposals(tenantId, status);
    return { data: serializeBigInt(proposals) };
  }

  @Post('proposals/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveProposal(@CurrentUser() user: TenantSessionContext, @Param('id') id: string) {
    const tenantId = this.requireTenant(user);
    const proposal = await this.bankProcessingService.approveProposal(tenantId, user.userId, id);
    return { data: serializeBigInt(proposal) };
  }

  @Post('proposals/:id/correct')
  @HttpCode(HttpStatus.OK)
  async correctProposal(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Body() dto: CorrectProposalInput,
  ) {
    const tenantId = this.requireTenant(user);
    const proposal = await this.bankProcessingService.correctAndApproveProposal(
      tenantId,
      user.userId,
      id,
      dto,
    );
    return { data: serializeBigInt(proposal) };
  }

  @Post('proposals/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectProposal(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Body() dto: RejectProposalInput,
  ) {
    const tenantId = this.requireTenant(user);
    const proposal = await this.bankProcessingService.rejectProposal(
      tenantId,
      user.userId,
      id,
      dto,
    );
    return { data: serializeBigInt(proposal) };
  }

  // --- Exceptions ---
  @Get('exceptions')
  @HttpCode(HttpStatus.OK)
  async listExceptions(
    @CurrentUser() user: TenantSessionContext,
    @Query('status') status?: ExceptionStatus,
    @Query('severity') severity?: ExceptionSeverity,
  ) {
    const tenantId = this.requireTenant(user);
    const exceptions = await this.bankProcessingService.listExceptions(tenantId, {
      status,
      severity,
    });
    return { data: serializeBigInt(exceptions) };
  }

  @Post('exceptions/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveException(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Body() dto: ResolveExceptionInput,
  ) {
    const tenantId = this.requireTenant(user);
    const exception = await this.bankProcessingService.resolveException(
      tenantId,
      user.userId,
      id,
      dto,
    );
    return { data: serializeBigInt(exception) };
  }
}
