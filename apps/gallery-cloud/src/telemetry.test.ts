import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitGalleryTelemetry } from './telemetry';

afterEach(() => vi.restoreAllMocks());
describe('operational telemetry', () => {
  it('emits bounded numeric counters without unknown sensitive fields', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    emitGalleryTelemetry({ operation: 'maintenance', outcome: 'success', durationMs: 12.4,
      expiredUploads: 2, recoveredCleanupJobs: -1, queuedUploads: Infinity,
      secret: 'never-emit', url: 'https://private.example/photo?token=secret' } as Parameters<typeof emitGalleryTelemetry>[0]);
    expect(JSON.parse(log.mock.calls[0]![0])).toEqual({ event: 'gallery_metric', operation: 'maintenance',
      outcome: 'success', durationMs: 12, expiredUploads: 2, recoveredCleanupJobs: 0 });
  });
  it('logs catalog codes but discards arbitrary exception text', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    emitGalleryTelemetry({ operation: 'upload', outcome: 'retry', durationMs: 1, errorCode: 'CLOUD_RETRY' });
    expect(JSON.parse(log.mock.calls[0]![0]).errorCode).toBe('CLOUD_RETRY');
    emitGalleryTelemetry({ operation: 'upload', outcome: 'failure', durationMs: 1, errorCode: 'https://private/key?token=secret' });
    expect(JSON.parse(log.mock.calls[1]![0])).not.toHaveProperty('errorCode');
  });
});
