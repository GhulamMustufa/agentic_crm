import { Logger } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';

import {
  getMemorySnapshot,
  logMemoryDiagnostics,
} from '../../src/modules/banking/utils/memory-diagnostics';

describe('MemoryDiagnostics Utility', () => {
  it('returns valid bounded memory metrics in megabytes', () => {
    const snapshot = getMemorySnapshot({
      stage: 'TEST_STAGE',
      jobId: 'job-123',
      pageCount: 5,
      batchIndex: 0,
      totalBatches: 2,
    });

    expect(snapshot.stage).toBe('TEST_STAGE');
    expect(snapshot.jobId).toBe('job-123');
    expect(snapshot.pageCount).toBe(5);
    expect(snapshot.batchIndex).toBe(0);
    expect(snapshot.totalBatches).toBe(2);

    expect(typeof snapshot.rssMb).toBe('number');
    expect(snapshot.rssMb).toBeGreaterThan(0);
    expect(typeof snapshot.heapUsedMb).toBe('number');
    expect(snapshot.heapUsedMb).toBeGreaterThan(0);
    expect(typeof snapshot.heapTotalMb).toBe('number');
    expect(snapshot.heapTotalMb).toBeGreaterThanOrEqual(snapshot.heapUsedMb);
  });

  it('logs structured memory diagnostics without sensitive financial data', () => {
    const logger = new Logger('TestLogger');
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    logMemoryDiagnostics(logger, {
      stage: 'JOB_START',
      jobId: '42',
      pageCount: 10,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = logSpy.mock.calls[0]?.[0] as string;

    expect(loggedMessage).toContain('[MemoryDiagnostics] stage=JOB_START jobId=42 pages=10');
    expect(loggedMessage).toContain('rss=');
    expect(loggedMessage).toContain('heapUsed=');
    expect(loggedMessage).not.toContain('amount');
    expect(loggedMessage).not.toContain('password');

    logSpy.mockRestore();
  });
});
