import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';

import { OBJECT_STORAGE_TOKEN } from '../../../core/storage/storage.service';
import { BankProcessingService } from '../services/bank-processing.service';
import { logMemoryDiagnostics } from '../utils/memory-diagnostics';

import type { IObjectStorage } from '../../../core/storage/storage.service';
import type { QueueStatementUploadInput } from '../dto/banking.dto';

interface StatementJobData {
  tenantId: string;
  userId: string;
  dto: QueueStatementUploadInput;
}

@Processor('statement-processing', {
  concurrency: 1,
  lockDuration: 300000,
  stalledInterval: 60000,
  maxStalledCount: 1,
})
export class StatementProcessor extends WorkerHost {
  private readonly logger = new Logger(StatementProcessor.name);

  constructor(
    private readonly bankProcessingService: BankProcessingService,
    @Inject(OBJECT_STORAGE_TOKEN) private readonly storageService: IObjectStorage,
  ) {
    super();
  }

  async process(job: Job<StatementJobData, unknown, string>): Promise<unknown> {
    logMemoryDiagnostics(this.logger, { stage: 'JOB_START', jobId: job.id });
    this.logger.log(`Processing statement job ${job.id} for tenant ${job.data.tenantId}`);

    const { tenantId, userId, dto } = job.data;

    try {
      // 1. Download from S3/Neon Object Storage
      this.logger.debug(`Downloading object ${dto.objectKey} from storage...`);
      await job.updateProgress({
        stage: 'DOWNLOADING',
        percent: 15,
        message: 'Downloading statement from secure storage...',
        step: 1,
      });
      const buffer = await this.storageService.getObject(dto.objectKey);
      logMemoryDiagnostics(this.logger, { stage: 'DOWNLOAD_COMPLETE', jobId: job.id });

      // 2. Format content for parser (pass Buffer directly for PDF to prevent Base64 heap amplification)
      const content = dto.mimeType === 'text/csv' ? buffer.toString('utf-8') : buffer;

      // 3. Process with fine-grained progress tracking and lightweight result mode
      this.logger.debug(`Parsing statement ${dto.fileName}...`);
      const result = await this.bankProcessingService.processStatementUpload(
        tenantId,
        userId,
        {
          bankAccountId: dto.bankAccountId,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          content,
          manualBankName: dto.manualBankName,
          manualAccountType: dto.manualAccountType,
          manualAccountNumberLast4: dto.manualAccountNumberLast4,
        },
        {
          lightweightResult: true,
          jobId: job.id,
          onProgress: async (progress) => {
            await job.updateProgress(progress);
          },
        },
      );

      await job.updateProgress({
        stage: 'COMPLETE',
        percent: 100,
        message: 'Statement processed and reconciled successfully',
        step: 4,
      });

      logMemoryDiagnostics(this.logger, { stage: 'JOB_COMPLETE', jobId: job.id });
      this.logger.log(`Successfully processed statement job ${job.id}`);

      return {
        statement: {
          id: result.statement.id,
          fileName: result.statement.fileName,
          status: result.statement.status,
          statementStartDate: result.statement.statementStartDate,
          statementEndDate: result.statement.statementEndDate,
          pageCount: result.statement.pageCount,
          totalDebitsCents: result.statement.totalDebitsCents.toString(),
          totalCreditsCents: result.statement.totalCreditsCents.toString(),
        },
        transactionCount: result.lineCount ?? result.transactions.length,
        proposalsCount: result.proposalsCount ?? result.proposals.length,
        exceptionsCount: result.exceptionsCount ?? result.exceptions.length,
      };
    } catch (error: unknown) {
      const err = error as
        { message?: string; stack?: string; status?: number; name?: string } | undefined;
      this.logger.error(
        `Failed to process statement job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Prevent retrying non-retryable domain exceptions (e.g. duplicate files, missing storage objects, validation errors, OOM crashes)
      const errorMsg = String(err?.message || '');
      const isUnrecoverable =
        errorMsg.includes('Duplicate statement') ||
        errorMsg.includes('Date collision') ||
        errorMsg.includes('Period collision') ||
        errorMsg.includes('checksum') ||
        errorMsg.includes('Object not found') ||
        errorMsg.includes('heap out of memory') ||
        errorMsg.includes('Allocation failed') ||
        errorMsg.includes('exceeds the maximum supported limit') ||
        err?.status === 400 ||
        err?.status === 409 ||
        err?.name === 'ConflictError' ||
        err?.name === 'BadRequestError';

      if (isUnrecoverable) {
        throw new UnrecoverableError(errorMsg);
      }

      throw error; // Let BullMQ handle network/transient retries
    }
  }
}
