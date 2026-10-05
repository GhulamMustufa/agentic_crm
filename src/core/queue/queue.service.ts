import { Injectable } from '@nestjs/common';

export interface QueueJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  createdAt: Date;
  error?: string;
}

export type JobProcessor<T = unknown> = (job: QueueJob<T>) => Promise<void>;

export interface IQueueService {
  enqueue<T>(
    queueName: string,
    jobName: string,
    data: T,
    options?: { jobId?: string; maxAttempts?: number },
  ): Promise<string>;
  registerProcessor<T>(queueName: string, processor: JobProcessor<T>): void;
}

export const QUEUE_SERVICE_TOKEN = Symbol('IQueueService');

@Injectable()
export class MemoryQueueService implements IQueueService {
  private readonly processors = new Map<string, JobProcessor>();
  private readonly jobs = new Map<string, QueueJob>();

  async enqueue<T>(
    queueName: string,
    jobName: string,
    data: T,
    options?: { jobId?: string; maxAttempts?: number },
  ): Promise<string> {
    const id = options?.jobId ?? `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: QueueJob<T> = {
      id,
      name: jobName,
      data,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      status: 'waiting',
      createdAt: new Date(),
    };

    this.jobs.set(id, job as QueueJob);

    // Asynchronously dispatch if processor registered
    const processor = this.processors.get(queueName);
    if (processor) {
      queueMicrotask(async () => {
        try {
          job.status = 'active';
          job.attempts += 1;
          await processor(job as QueueJob);
          job.status = 'completed';
        } catch (err) {
          job.status = 'failed';
          job.error = err instanceof Error ? err.message : String(err);
        }
      });
    }

    return id;
  }

  registerProcessor<T>(queueName: string, processor: JobProcessor<T>): void {
    this.processors.set(queueName, processor as JobProcessor);
  }

  getJob(id: string): QueueJob | undefined {
    return this.jobs.get(id);
  }

  clear(): void {
    this.jobs.clear();
    this.processors.clear();
  }
}
