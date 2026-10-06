import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { OBJECT_STORAGE_TOKEN } from '../../../core/storage/storage.service';
import { BankProcessingService } from '../services/bank-processing.service';

import type { IObjectStorage } from '../../../core/storage/storage.service';
import type { QueueStatementUploadInput } from '../dto/banking.dto';

interface StatementJobData {
  tenantId: string;
  userId: string;
  dto: QueueStatementUploadInput;
}

@Processor('statement-processing')
export class StatementProcessor extends WorkerHost {
  private readonly logger = new Logger(StatementProcessor.name);

  constructor(
    private readonly bankProcessingService: BankProcessingService,
    @Inject(OBJECT_STORAGE_TOKEN) private readonly storageService: IObjectStorage,
  ) {
    super();
  }

  async process(job: Job<StatementJobData, any, string>): Promise<any> {
    this.logger.log(`Processing statement job ${job.id} for tenant ${job.data.tenantId}`);
    
    const { tenantId, userId, dto } = job.data;
    
    try {
      // 1. Download from S3/Neon Object Storage
      this.logger.debug(`Downloading object ${dto.objectKey} from storage...`);
      const buffer = await this.storageService.getObject(dto.objectKey);
      
      // 2. Convert to Base64 for the existing processing service
      const contentBase64 = buffer.toString('base64');
      
      // 3. Process exactly as we did before, but now in the background
      this.logger.debug(`Parsing statement ${dto.fileName}...`);
      const result = await this.bankProcessingService.processStatementUpload(
        tenantId,
        userId,
        {
          bankAccountId: dto.bankAccountId,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          content: contentBase64,
        },
      );
      
      this.logger.log(`Successfully processed statement job ${job.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to process statement job ${job.id}: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw error; // Let BullMQ handle retries
    }
  }
}
