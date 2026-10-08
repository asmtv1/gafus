import { createGalleryImageProcessor, type GalleryImageEngine } from '@gafus/core/services/gallery/imageProcessing';
import { sourceUploadId, assertGalleryKey, assertFinalKey } from '@gafus/gallery-storage/keys';
import { objectMd5, normalizeETag, type GalleryObjectStore } from '@gafus/gallery-storage/objects';
import type { GalleryStorageJobClaim } from '@gafus/core/services/gallery';
import type { GalleryInternalClient } from './internal.js';
import type { GalleryMetric, GalleryTelemetry } from './telemetry.js';
export interface GalleryQueue { send(uploadId: string): Promise<void>; }
const permanent = new Set(['IMAGE_SIZE', 'IMAGE_PIXELS', 'IMAGE_FORMAT', 'IMAGE_ANIMATED', 'INVALID_IMAGE', 'OUTPUT_TOO_LARGE', 'SOURCE_CHANGED', 'IMMUTABLE_CONFLICT', 'COPY_MISMATCH', 'UNTRUSTED_CLAIM']);
function errorCode(e: unknown): string {
  const code = (e as { code?: string })?.code ?? (e as Error)?.message;
  return typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : 'CLOUD_RETRY';
}
/** Abort all S3 operations before the lease or function deadline. Check again before each write.
 * There is no renewal or write after a stale claim; core reserves delayed orphan cleanup. */
function lease(until: string, invocationDeadline: number, now: () => number) {
  const deadline = Math.min(Date.parse(until) - 5000, invocationDeadline);
  if (!Number.isFinite(deadline) || deadline <= now()) throw new Error('LEASE_EXPIRED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadline - now());
  timer.unref();
  return { signal: controller.signal, check() { if (controller.signal.aborted || now() >= deadline) throw new Error('LEASE_EXPIRED'); }, close() { clearTimeout(timer); controller.abort(); } };
}
export function createGalleryCloudWorker(input: { core: GalleryInternalClient; objects: GalleryObjectStore; engine: GalleryImageEngine; queue: GalleryQueue; now?: () => number; enabled?: boolean; telemetry?: GalleryTelemetry }) {
  const now = input.now ?? Date.now;
  const record = (metric: GalleryMetric) => { try { input.telemetry?.(metric); } catch { /* Observability cannot interrupt cleanup or publication. */ } };
  const processImage = createGalleryImageProcessor(input.engine);
  async function processUpload(uploadId: string, invocationDeadline = now() + 50_000) {
    const started = now();
    if (input.enabled === false) return;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uploadId)) throw new Error('UNTRUSTED_UPLOAD_ID');
    // No storage read before the registered upload has been claimed server-side.
    const claim = await input.core.claimUpload(uploadId);
    if (!claim) { record({ operation: 'upload', outcome: 'skipped', durationMs: now() - started }); return; }
    let guard: ReturnType<typeof lease> | undefined;
    let completing = false;
    try {
      guard = lease(claim.leaseUntil, invocationDeadline, now);
      const source = sourceUploadId(claim.sourceKey);
      if (claim.uploadId !== uploadId || source !== uploadId || !claim.sourceETag) throw new Error('UNTRUSTED_CLAIM');
      const prefix = claim.sourceKey.slice(0, claim.sourceKey.lastIndexOf('/'));
      const expected = `${prefix}/attempts/${claim.attemptToken}`;
      assertGalleryKey(claim.thumbKey); assertGalleryKey(claim.fullKey);
      if (claim.thumbKey !== `${expected}/thumb.webp` || claim.fullKey !== `${expected}/full.webp`) throw new Error('UNTRUSTED_CLAIM');
      guard.check();
      const sourceObject = await input.objects.read(claim.sourceKey, claim.sourceETag, guard.signal);
      if (sourceObject.metadata.etag !== normalizeETag(claim.sourceETag)) throw new Error('SOURCE_CHANGED');
      const images = await processImage(sourceObject.bytes);
      guard.check(); await input.objects.create(claim.thumbKey, images.thumb.bytes, 'image/webp', guard.signal);
      guard.check(); await input.objects.create(claim.fullKey, images.full.bytes, 'image/webp', guard.signal);
      guard.check(); completing = true;
      const result = await input.core.completeUpload({ uploadId, attemptToken: claim.attemptToken, sourceETag: claim.sourceETag, width: images.full.width, height: images.full.height });
      if (!result.accepted) throw new Error('CALLBACK_REJECTED');
      record({ operation: 'upload', outcome: 'success', durationMs: now() - started });
      // Durable publish job now owns publication. Source and orphan deletion belong to core.
    } catch (error) {
      if (!completing) {
        const code = errorCode(error);
        await input.core.failUpload({ uploadId, attemptToken: claim.attemptToken, errorCode: code, retryable: !permanent.has(code) });
        record({ operation: 'upload', outcome: permanent.has(code) ? 'failure' : 'retry', durationMs: now() - started, errorCode: code });
        if (permanent.has(code)) return;
      }
      if (completing) record({ operation: 'upload', outcome: 'retry', durationMs: now() - started, errorCode: errorCode(error) });
      throw error;
    } finally { guard?.close(); }
  }
  async function processJob(job: GalleryStorageJobClaim, invocationDeadline: number) {
    const started = now();
    let guard: ReturnType<typeof lease> | undefined; let completing = false;
    try {
      guard = lease(job.leaseUntil, invocationDeadline, now);
      if (job.writeMode !== 'create-if-absent' || !Array.isArray(job.sourceKeys) || job.sourceKeys.length > 32) throw new Error('UNTRUSTED_CLAIM');
      job.sourceKeys.forEach(assertGalleryKey);
      if (job.kind === 'delete') {
        if (job.targetKeys.length) throw new Error('UNTRUSTED_CLAIM');
        for (const key of job.sourceKeys) { guard.check(); await input.objects.delete(key, guard.signal); }
      } else {
        if (!['move', 'publish'].includes(job.kind) || job.sourceKeys.length !== 2 || job.targetKeys.length !== 2 || job.sourceETags.length !== 2) throw new Error('UNTRUSTED_CLAIM');
        job.targetKeys.forEach(assertFinalKey);
        for (let i = 0; i < 2; i++) {
          guard.check();
          const source = await input.objects.read(job.sourceKeys[i]!, job.sourceETags[i]!, guard.signal);
          if (source.metadata.etag !== normalizeETag(job.sourceETags[i]!) || source.metadata.contentType !== 'image/webp' || objectMd5(source.bytes) !== normalizeETag(job.sourceETags[i]!)) throw new Error('COPY_MISMATCH');
          guard.check();
          const target = await input.objects.create(job.targetKeys[i]!, source.bytes, 'image/webp', guard.signal);
          if (target.etag !== source.metadata.etag || target.bytes !== source.metadata.bytes || target.contentType !== source.metadata.contentType) throw new Error('COPY_MISMATCH');
        }
      }
      guard.check(); completing = true;
      const result = await input.core.completeJob({ jobId: job.jobId, attemptToken: job.attemptToken });
      if (!result.accepted) throw new Error('CALLBACK_REJECTED');
      record({ operation: job.kind, outcome: 'success', durationMs: now() - started });
    } catch (error) {
      record({ operation: job.kind, outcome: permanent.has(errorCode(error)) ? 'failure' : 'retry', durationMs: now() - started, errorCode: errorCode(error) });
      if (!completing) await input.core.failJob({ jobId: job.jobId, attemptToken: job.attemptToken, errorCode: errorCode(error), retryable: !permanent.has(errorCode(error)) });
      throw error;
    } finally { guard?.close(); }
  }
  return {
    processUpload, processJob,
    async maintenance() {
      const started = now();
      const deadline = now() + 50_000;
      const result = await input.core.maintenance(10);
      if (input.enabled !== false) for (const id of result.processUploadIds) { if (now() >= deadline) throw new Error('INVOCATION_DEADLINE'); await input.queue.send(id); }
      // Scheduled delete recovery must keep running when product is disabled.
      if (now() >= deadline) throw new Error('INVOCATION_DEADLINE');
      const jobs = await input.core.claimJobs(1);
      for (const job of jobs) await processJob(job, deadline);
      record({ operation: 'maintenance', outcome: 'success', durationMs: now() - started,
        expiredUploads: result.expiredUploads, recoveredCleanupJobs: result.recoveredCleanupJobs,
        reconciledJobs: result.reconciledJobs, queuedUploads: input.enabled !== false ? result.processUploadIds.length : 0 });
      return result;
    },
  };
}
