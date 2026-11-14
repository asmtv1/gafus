/** Worker-only infrastructure: fenced PostgreSQL outbox plus Beget purge ACK.
 * Pure Core prepares the transactionally durable purge intent. */
import { randomUUID } from "node:crypto";
import {
  beginBegetCdnPurge,
  begetCdnPurgeDone,
  isBegetCacheableObjectKey,
} from "@gafus/cdn-upload";

import { createMediaCdnPurgeRepository, type EdgePurgeJob } from "@gafus/media-server/purge-repository";
export type { EdgePurgeJob } from "@gafus/media-server/purge-repository";

/** Pure fail-closed verification for snapshot keys from a dedicated SQL outbox. */
export function verifyEdgePurgeJob(job: EdgePurgeJob): asserts job is EdgePurgeJob & {
  scope: "gallery" | "feed";
} {
  if (!["gallery", "feed"].includes(job.scope) ||
      !new RegExp(`^${job.scope}:[A-Za-z0-9_-]{1,128}$`).test(job.id) ||
      !/^[0-9a-f-]{36}$/.test(job.attemptToken) ||
      !Array.isArray(job.paths) || job.paths.length < 1 || job.paths.length > 1024 ||
      job.paths.some(path => typeof path !== "string" || !path.startsWith("/") ||
        !isBegetCacheableObjectKey(job.scope as "gallery" | "feed", path.slice(1))) ||
      !Array.isArray(job.purgeOperations) || job.purgeOperations.length > 103)
    throw new Error("MEDIA_PURGE_JOB_UNTRUSTED");
}

export type EdgePurgeDeps = {
  claim(token: string): Promise<EdgePurgeJob | undefined>;
  checkpoint(job: EdgePurgeJob, operations: string[]): Promise<void>;
  complete(job: EdgePurgeJob): Promise<void>;
  retry(job: EdgePurgeJob, code: string, retryMs: number): Promise<void>;
  begin: typeof beginBegetCdnPurge;
  done: typeof begetCdnPurgeDone;
  now: () => number;
};

/** Each cycle uses a lease-fenced durable checkpoint before clearing S3 jobs. */
export async function processOneMediaCdnPurge(deps: EdgePurgeDeps): Promise<"empty" | "done" | "pending"> {
  const job = await deps.claim(randomUUID());
  if (!job) return "empty";
  try {
    verifyEdgePurgeJob(job);
    const operations = await deps.begin(job.scope, job.paths, job.purgeOperations,
      async (latest) => deps.checkpoint(job, latest));
    if (operations.length < 1) throw new Error("MEDIA_PURGE_NO_OPERATIONS");
    // Every distinct batch must have a matching durable operation. An
    // incomplete checkpoint must not be mistaken for successful revocation.
    const expectedBatches = Math.ceil(job.paths.length / 10);
    if (operations.length !== expectedBatches) throw new Error("MEDIA_PURGE_INCOMPLETE_BATCHES");
    for (const operation of operations) {
      const done = operation.startsWith("done:") || await deps.done(operation);
      if (!done) {
        await deps.retry(job, "MEDIA_PURGE_PENDING", 60_000);
        return "pending";
      }
    }
    await deps.complete(job);
    return "done";
  } catch {
    // Do not store provider payloads / signatures / PII in DB or logs.
    const retryMs = Math.min(3_600_000, 60_000 * 2 ** Math.min(job.attempts, 6));
    await deps.retry(job, "MEDIA_PURGE_RETRY", retryMs);
    return "pending";
  }
}

export function createMediaCdnPurgeDependencies(): EdgePurgeDeps {
  return {
    ...createMediaCdnPurgeRepository(),
    now: Date.now,
    begin: beginBegetCdnPurge,
    done: begetCdnPurgeDone,
  };
}

let running = false;
export async function processDueMediaCdnPurges(limit = 2) {
  if (process.env.MEDIA_CDN_PURGE_WORKER_ENABLED !== "true" || running) return { skipped: true };
  running = true;
  let done = 0;
  let pending = 0;
  try {
    const deps = createMediaCdnPurgeDependencies();
    for (let i = 0; i < Math.min(3, Math.max(1, limit)); i++) {
      const state = await processOneMediaCdnPurge(deps);
      if (state === "empty") break;
      if (state === "done") done++;
      if (state === "pending") pending++;
    }
    return { done, pending };
  } finally { running = false; }
}
