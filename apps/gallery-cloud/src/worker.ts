import { assertGalleryKey, assertFinalKey } from "@gafus/gallery-storage/keys";
import { objectMd5, normalizeETag, type GalleryObjectStore } from "@gafus/gallery-storage/objects";
import type { GalleryStorageJobClaim } from "@gafus/core/services/gallery";
import type { GalleryInternalClient } from "./internal.js";
import type { GalleryMetric, GalleryTelemetry } from "./telemetry.js";
import { createVetPreview } from "./vet-preview.js";
const permanent = new Set([
  "IMAGE_SIZE",
  "IMAGE_PIXELS",
  "IMAGE_FORMAT",
  "IMAGE_ANIMATED",
  "INVALID_IMAGE",
  "OUTPUT_TOO_LARGE",
  "SOURCE_CHANGED",
  "IMMUTABLE_CONFLICT",
  "COPY_MISMATCH",
  "UNTRUSTED_CLAIM",
]);
function errorCode(e: unknown): string {
  const code = (e as { code?: string })?.code ?? (e as Error)?.message;
  return typeof code === "string" && /^[A-Z_]{1,64}$/.test(code) ? code : "CLOUD_RETRY";
}
/** Abort all S3 operations before the lease or function deadline. Check again before each write.
 * There is no renewal or write after a stale claim; core reserves delayed orphan cleanup. */
function lease(until: string, invocationDeadline: number, now: () => number) {
  const deadline = Math.min(Date.parse(until) - 5000, invocationDeadline);
  if (!Number.isFinite(deadline) || deadline <= now()) throw new Error("LEASE_EXPIRED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadline - now());
  timer.unref();
  return {
    signal: controller.signal,
    check() {
      if (controller.signal.aborted || now() >= deadline) throw new Error("LEASE_EXPIRED");
    },
    close() {
      clearTimeout(timer);
      controller.abort();
    },
  };
}
export function createGalleryCloudWorker(input: {
  core: GalleryInternalClient;
  objects: GalleryObjectStore;
  now?: () => number;
  telemetry?: GalleryTelemetry;
}) {
  const now = input.now ?? Date.now;
  const record = (metric: GalleryMetric) => {
    try {
      input.telemetry?.(metric);
    } catch {
      /* Observability cannot interrupt cleanup or publication. */
    }
  };
  /** No legacy album photo processing: only client-verified WebP can become READY.
   * Stale Queue/S3 event deliveries must not GET or transform source images.
   */
  async function processUpload(_uploadId:string):Promise<never>{
    throw new Error("GALLERY_CLIENT_WEBP_REQUIRED");
  }
  async function processJob(job: GalleryStorageJobClaim, invocationDeadline: number) {
    const started = now();
    let guard: ReturnType<typeof lease> | undefined;
    let completing = false;
    try {
      guard = lease(job.leaseUntil, invocationDeadline, now);
      if (
        job.writeMode !== "create-if-absent" ||
        !Array.isArray(job.sourceKeys) ||
        job.sourceKeys.length > 32
      )
        throw new Error("UNTRUSTED_CLAIM");
      job.sourceKeys.forEach(assertGalleryKey);
      if (job.kind === "delete") {
        if (job.targetKeys.length) throw new Error("UNTRUSTED_CLAIM");
        for (const key of job.sourceKeys) {
          guard.check();
          await input.objects.delete(key, guard.signal);
        }
      } else if (job.kind === "vetPreview") {
        if (
          job.sourceKeys.length !== 1 ||
          job.targetKeys.length !== 1 ||
          job.sourceETags.length !== 1
        )
          throw new Error("UNTRUSTED_CLAIM");
        const source = job.sourceKeys[0]!;
        const target = job.targetKeys[0]!;
        if (
          !/^users\/[A-Za-z0-9_-]+\/pets\/[A-Za-z0-9_-]+\/vet-visits\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/original\.(jpg|png|webp)$/.test(
            source,
          ) ||
          target !== source.replace(/\/original\.(jpg|png|webp)$/, "/thumb.webp")
        )
          throw new Error("UNTRUSTED_CLAIM");
        assertFinalKey(target);
        guard.check();
        const file = await input.objects.read(source, job.sourceETags[0], guard.signal);
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.metadata.contentType) ||
          file.metadata.etag !== normalizeETag(job.sourceETags[0]!)
        )
          throw new Error("SOURCE_CHANGED");
        const preview = await createVetPreview(file.bytes);
        guard.check();
        await input.objects.create(target, preview, "image/webp", guard.signal);
      } else {
        if (
          job.kind !== "move" ||
          job.sourceKeys.length !== 2 ||
          job.targetKeys.length !== 2 ||
          job.sourceETags.length !== 2
        )
          throw new Error("UNTRUSTED_CLAIM");
        job.targetKeys.forEach(assertFinalKey);
        const parseAlbumKey=(key:string)=>
          /^albums\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/photos\/([A-Za-z0-9_-]+)\/(thumb|full)\.webp$/.exec(key);
        const sources=job.sourceKeys.map(parseAlbumKey);
        const destinations=job.targetKeys.map(parseAlbumKey);
        if(sources.some(x=>!x)||destinations.some(x=>!x)||
           sources[0]![1]!==sources[1]![1]||
           sources[0]![3]!==sources[1]![3]||
           destinations[0]![1]!==sources[0]![1]||
           destinations[1]![1]!==sources[0]![1]||
           destinations[0]![3]!==sources[0]![3]||
           destinations[1]![3]!==sources[0]![3]||
           sources[0]![4]!=="thumb"||sources[1]![4]!=="full"||
           destinations[0]![4]!=="thumb"||destinations[1]![4]!=="full"||
           destinations[0]![2]!==destinations[1]![2])
          throw new Error("UNTRUSTED_CLAIM");
        for (let i = 0; i < 2; i++) {
          guard.check();
          const source = await input.objects.read(
            job.sourceKeys[i]!,
            job.sourceETags[i]!,
            guard.signal,
          );
          if (
            source.metadata.etag !== normalizeETag(job.sourceETags[i]!) ||
            source.metadata.contentType !== "image/webp" ||
            objectMd5(source.bytes) !== normalizeETag(job.sourceETags[i]!)
          )
            throw new Error("COPY_MISMATCH");
          guard.check();
          const target = await input.objects.create(
            job.targetKeys[i]!,
            source.bytes,
            "image/webp",
            guard.signal,
          );
          if (
            target.etag !== source.metadata.etag ||
            target.bytes !== source.metadata.bytes ||
            target.contentType !== source.metadata.contentType
          )
            throw new Error("COPY_MISMATCH");
        }
      }
      guard.check();
      completing = true;
      const result = await input.core.completeJob({
        jobId: job.jobId,
        attemptToken: job.attemptToken,
      });
      if (!result.accepted) throw new Error("CALLBACK_REJECTED");
      record({ operation: job.kind, outcome: "success", durationMs: now() - started });
    } catch (error) {
      record({
        operation: job.kind,
        outcome: permanent.has(errorCode(error)) ? "failure" : "retry",
        durationMs: now() - started,
        errorCode: errorCode(error),
      });
      if (!completing)
        await input.core.failJob({
          jobId: job.jobId,
          attemptToken: job.attemptToken,
          errorCode: errorCode(error),
          retryable: !permanent.has(errorCode(error)),
        });
      throw error;
    } finally {
      guard?.close();
    }
  }
  return {
    processUpload,
    processJob,
    async maintenance() {
      const started = now();
      const deadline = now() + 50_000;
      const result = await input.core.maintenance(10);
      // Discard retired upload wake-ups; DELETE/move/vet-preview remain active.
      // Scheduled delete recovery must keep running when product is disabled.
      if (now() >= deadline) throw new Error("INVOCATION_DEADLINE");
      // Drain a bounded page in one timer invocation. One job every five minutes
      // lets cleanup backlog consume an upload's entire publication window.
      // Claim one at a time so unstarted jobs never hold leases when time runs out.
      for (let processed = 0; processed < 10 && now() + 10_000 < deadline; processed++) {
        const jobs = await input.core.claimJobs(1);
        if (!jobs.length) break;
        if (jobs.length !== 1) throw new Error("UNTRUSTED_CLAIM");
        await processJob(jobs[0]!, deadline);
      }
      record({
        operation: "maintenance",
        outcome: "success",
        durationMs: now() - started,
        expiredUploads: result.expiredUploads,
        recoveredCleanupJobs: result.recoveredCleanupJobs,
        reconciledJobs: result.reconciledJobs,
        queuedUploads: 0,
      });
      return result;
    },
  };
}
