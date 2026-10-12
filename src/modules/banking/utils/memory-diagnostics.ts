import { Logger } from '@nestjs/common';

export interface MemorySnapshotMeta {
  stage: string;
  jobId?: string | number;
  pageCount?: number;
  batchIndex?: number;
  totalBatches?: number;
}

export interface MemoryDiagnosticsSnapshot {
  stage: string;
  jobId?: string | number;
  pageCount?: number;
  batchIndex?: number;
  totalBatches?: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
}

/**
 * Captures bounded memory metrics without leaking any sensitive financial or personal data.
 */
export function getMemorySnapshot(meta: MemorySnapshotMeta): MemoryDiagnosticsSnapshot {
  const mem = process.memoryUsage();
  const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

  return {
    stage: meta.stage,
    jobId: meta.jobId,
    pageCount: meta.pageCount,
    batchIndex: meta.batchIndex,
    totalBatches: meta.totalBatches,
    rssMb: toMb(mem.rss),
    heapUsedMb: toMb(mem.heapUsed),
    heapTotalMb: toMb(mem.heapTotal),
    externalMb: toMb(mem.external),
  };
}

/**
 * Logs structured memory metrics safely for worker monitoring and debugging.
 */
export function logMemoryDiagnostics(
  logger: Logger,
  meta: MemorySnapshotMeta,
): MemoryDiagnosticsSnapshot {
  const snapshot = getMemorySnapshot(meta);

  const batchInfo =
    meta.batchIndex !== undefined && meta.totalBatches !== undefined
      ? ` batch=${meta.batchIndex + 1}/${meta.totalBatches}`
      : '';
  const pageInfo = meta.pageCount !== undefined ? ` pages=${meta.pageCount}` : '';
  const jobInfo = meta.jobId !== undefined ? ` jobId=${meta.jobId}` : '';

  logger.log(
    `[MemoryDiagnostics] stage=${snapshot.stage}${jobInfo}${pageInfo}${batchInfo} ` +
      `rss=${snapshot.rssMb}MB heapUsed=${snapshot.heapUsedMb}MB heapTotal=${snapshot.heapTotalMb}MB external=${snapshot.externalMb}MB`,
  );

  return snapshot;
}
