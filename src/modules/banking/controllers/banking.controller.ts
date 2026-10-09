import { InjectQueue } from '@nestjs/bullmq';
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
  Inject,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';

import { AuthorizationError } from '../../../core/errors/app-error';
import { CurrentUser } from '../../../core/security/decorators/auth.decorators';
import { JwtAuthGuard } from '../../../core/security/guards/jwt-auth.guard';
import { OBJECT_STORAGE_TOKEN } from '../../../core/storage/storage.service';
import { BankProcessingService } from '../services/bank-processing.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type { IObjectStorage } from '../../../core/storage/storage.service';
import type { BankTransactionStatus } from '../domain/bank-transaction.entity';
import type { ExceptionSeverity, ExceptionStatus } from '../domain/exception-item.entity';
import type { ProposalStatus } from '../domain/proposal.entity';
import type {
  CreateBankAccountInput,
  UploadStatementInput,
  PresignedUrlInput,
  QueueStatementUploadInput,
  CorrectProposalInput,
  RejectProposalInput,
  ResolveExceptionInput,
} from '../dto/banking.dto';

function serializeBigInt(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (obj instanceof Date) {
    return obj.toISOString();
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
  constructor(
    private readonly bankProcessingService: BankProcessingService,
    @Inject(OBJECT_STORAGE_TOKEN) private readonly storageService: IObjectStorage,
    @InjectQueue('statement-processing') private readonly statementQueue: Queue,
  ) {}

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

  @Post('statements/presigned-url')
  @HttpCode(HttpStatus.OK)
  async getPresignedUrl(@CurrentUser() user: TenantSessionContext, @Body() dto: PresignedUrlInput) {
    const tenantId = this.requireTenant(user);
    // Generate a unique key for the upload
    const objectKey = `tenants/${tenantId}/statements/${Date.now()}-${dto.fileName}`;
    const url = await this.storageService.getPresignedUploadUrl(objectKey, dto.mimeType, 900);
    return {
      data: {
        url,
        objectKey,
      },
    };
  }

  @Post('statements/queue-upload')
  @HttpCode(HttpStatus.ACCEPTED)
  async queueUpload(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: QueueStatementUploadInput,
  ) {
    const tenantId = this.requireTenant(user);
    // Queue the job
    const job = await this.statementQueue.add(
      'process-statement',
      {
        tenantId,
        userId: user.userId,
        dto,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    return {
      data: {
        jobId: job.id,
        status: 'QUEUED',
      },
    };
  }

  @Get('statements/jobs/:id')
  @HttpCode(HttpStatus.OK)
  async getJobStatus(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Query('fileName') fileName?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const job = await this.statementQueue.getJob(id);
    if (job) {
      const state = await job.getState();
      const progress = job.progress;
      let result = state === 'completed' ? serializeBigInt(job.returnvalue) : null;

      // If job completed in BullMQ but returnvalue needs statement re-fetch:
      if (state === 'completed' && !result) {
        const recent = await this.bankProcessingService.findRecentStatement(tenantId, fileName);
        if (recent) {
          const fullResult = await this.bankProcessingService.getStatementUploadResult(
            tenantId,
            recent.id,
          );
          if (fullResult) {
            result = serializeBigInt(fullResult);
          }
        }
      }

      return {
        data: {
          id: job.id,
          state,
          progress,
          result,
          failedReason: job.failedReason,
        },
      };
    }

    // Fallback to PostgreSQL database state if BullMQ job has expired or was purged
    const recentStatement = await this.bankProcessingService.findRecentStatement(
      tenantId,
      fileName,
    );
    if (recentStatement) {
      const isFresh = Date.now() - new Date(recentStatement.createdAt).getTime() < 30 * 60 * 1000;
      if (isFresh) {
        if (recentStatement.status === 'PARSED' || recentStatement.status === 'RECONCILED') {
          const fullResult = await this.bankProcessingService.getStatementUploadResult(
            tenantId,
            recentStatement.id,
          );
          return {
            data: {
              id,
              state: 'completed',
              progress: { percent: 100, stage: 'COMPLETE', step: 4 },
              result: fullResult ? serializeBigInt(fullResult) : null,
            },
          };
        } else if (recentStatement.status === 'FAILED') {
          return {
            data: {
              id,
              state: 'failed',
              failedReason: recentStatement.errorMessage || 'Statement processing failed',
            },
          };
        } else if (
          recentStatement.status === 'PROCESSING' ||
          recentStatement.status === 'UPLOADED'
        ) {
          return {
            data: {
              id,
              state: 'active',
              progress: { percent: 50, stage: 'PROCESSING', step: 2 },
              result: null,
            },
          };
        }
      }
    }

    return { data: { id, state: 'not_found' } };
  }

  @Sse('statements/stream/:id')
  streamJobStatus(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Query('fileName') fileName?: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      let isSubscribed = true;
      const poll = async () => {
        if (!isSubscribed) {
          return;
        }
        try {
          const res = await this.getJobStatus(user, id, fileName);
          observer.next({ data: JSON.stringify(res.data) } as MessageEvent);
          if (
            res.data.state === 'completed' ||
            res.data.state === 'failed' ||
            res.data.state === 'not_found'
          ) {
            observer.complete();
            isSubscribed = false;
            return;
          }
        } catch (err: unknown) {
          observer.error(err);
          isSubscribed = false;
          return;
        }
        if (isSubscribed) {
          setTimeout(poll, 1500);
        }
      };

      poll();
      return () => {
        isSubscribed = false;
      };
    });
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
