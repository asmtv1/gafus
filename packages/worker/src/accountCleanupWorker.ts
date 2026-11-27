import crypto from "node:crypto";
import {
 claimAccountCleanupJob,accountCleanupOwnerExists,
 checkpointAccountStreamJob,beginAccountCleanupSweep,resetAccountCdnPurge,checkpointAccountKeysCursor,
 completeAccountPrivateScope,checkpointAccountCdnOperations,
 scheduleAccountCdnPurge,completeAccountStorageJob,retryAccountStorageJob,
} from "@gafus/identity-write-server/account-cleanup-worker-rows";
import { createWebLogger } from "@gafus/logger";
import {
  accountStorageTargets,
  DUAL_PROVIDER_CLEANUP_MARKER,
  createAccountStorageCleaner,
  startAccountCdnPurge,
  accountCdnPurgeDone,
} from "@gafus/cdn-upload";
import { deleteAccountStreamFiles } from "./accountCleanupStream";

const logger = createWebLogger("account-storage-cleanup");
let running = false;

/** Existing unrestricted scheduled-worker entry: unchanged behavior. */
export async function processAccountStorageCleanup(limit = 3) {
  return processAccountStorageCleanupInternal(limit, null);
}

/** Restricted original worker path for a single synthetic account's PRIVATE scopes.
 * Never drains the shared WORK queue or calls external CDN/Stream providers.
 * Kept off by default; caller must prove project-local isolated dev runtime.
 */
export async function processPrivateAccountStorageCleanupForOwner(ownerId: string, limit = 3) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 10 ||
      process.env.NODE_ENV !== "development" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
      process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled")
    throw new Error("CLEANUP_OWNER_SCOPED_LOCAL_ONLY_DENIED");
  return processAccountStorageCleanupInternal(limit, ownerId);
}

/** Token-fenced original worker algorithm, with optional exact-owner scope guard. */
async function processAccountStorageCleanupInternal(limit: number, selectedOwner: string | null) {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < limit; i++) {
      const token = crypto.randomUUID();
      const job = await claimAccountCleanupJob(token,selectedOwner);
      if (!job) break;
      let storageVerified = false;
      let sweepChangedStorage = false;
      const requireLease = (affected: number) => {
        if (affected !== 1) throw new Error("CLEANUP_LEASE_LOST");
      };
      try {
        // Never sweep an existing owner, including an accidentally reused account ID.
        if (await accountCleanupOwnerExists(job.ownerId))
          throw new Error("CLEANUP_OWNER_EXISTS");
        if (job.scope === "stream") {
          // Bounded pages with persisted progress; failures do not lose unprocessed files.
          await deleteAccountStreamFiles(job.keys.slice(0, 10));
          const remaining = job.keys.slice(10);
          requireLease(await checkpointAccountStreamJob(job,token,remaining));
          continue;
        }
        if (
          job.prefixes?.includes(DUAL_PROVIDER_CLEANUP_MARKER) &&
          process.env[`${job.scope.toUpperCase()}_DUAL_PROVIDER_CLEANUP`] !== "true"
        )
          throw new Error("CLEANUP_LEGACY_PROVIDER_REQUIRED");
        const targets = accountStorageTargets(job.scope, job.ownerId, job.keys, job.prefixes);
        // Prefix sweep already handles these objects in S3. Keep the full DB
        // snapshot for exact per-file CDN purges, but do not repeat S3 work.
        const extraKeys = targets.keys.filter(
          (key) => !targets.prefixes.some((prefix) => key.startsWith(prefix)),
        );
        const cursor = job.keyCursor ?? 0;
        const nextCursor = Math.min(cursor + 20, extraKeys.length);
        // Only public/CDN scopes need the durable pre-delete intent.
        // Private scopes are verified directly against the bucket.
        if (job.scope !== "questions" && job.scope !== "documents")
          requireLease(await beginAccountCleanupSweep(job, token));
        const removed = await createAccountStorageCleaner(job.scope).sweep(
          {
            prefixes: cursor === 0 ? targets.prefixes : [],
            keys: extraKeys.slice(cursor, nextCursor),
          },
          AbortSignal.timeout(45_000),
        );
        storageVerified = true;
        sweepChangedStorage = removed > 0;
        if (removed > 0) {
          job.purgeOperations = [];
          requireLease(await resetAccountCdnPurge(job,token));
        }
        if (nextCursor < extraKeys.length) {
          requireLease(await checkpointAccountKeysCursor(job,token,nextCursor,removed));
          continue;
        }
        if (job.scope === "questions" || job.scope === "documents") {
          // These objects are served by direct private S3 presigns, never a CDN.
          // After the verified bucket sweep there is no cache task to poll and
          // no reason to retain the deleted user's objects for another 15m.
          requireLease(await completeAccountPrivateScope(job,token));
          continue;
        }
        if (!job.purgeAfter || removed > 0) {
          const started = Date.now();
          const operations = await startAccountCdnPurge(
            job.scope,
            targets,
            job.purgeOperations,
            async (operations) => {
              const updated = await checkpointAccountCdnOperations(job,token,operations)
              if (updated !== 1 || Date.now() - started > 60_000)
                throw new Error("CLEANUP_PURGE_CHECKPOINT");
            },
          );
          // Yandex edge purge is asynchronous and may take 15 minutes even after acceptance.
          const after = new Date(Date.now() + 15 * 60_000);
          requireLease(await scheduleAccountCdnPurge(job,token,operations,after));
        } else {
          const started = Date.now();
          if (
            job.purgeAfter.getTime() > Date.now() ||
            !(await accountCdnPurgeDone(job.purgeOperations, async (operations) => {
              const updated = await checkpointAccountCdnOperations(job,token,operations)
              if (updated !== 1 || Date.now() - started > 60_000)
                throw new Error("CLEANUP_PURGE_POLL_CHECKPOINT");
            }))
          )
            throw new Error("CLEANUP_PURGE_PENDING");
          requireLease(await completeAccountStorageJob(job,token));
          logger.info("Account objects and CDN cleanup completed", {
            jobId: job.id,
            scope: job.scope,
          });
        }
      } catch (error) {
        // Never log SDK/provider payloads, URLs or credentials.
        const code =
          error instanceof Error && /^CLEANUP_[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "CLEANUP_RETRY";
        if (code === "CLEANUP_LEASE_LOST") {
          // Another attempt now owns the checkpoint. Do not mutate its state
          // or submit another provider operation under the expired token.
          logger.warn("Account storage cleanup lease lost", { jobId: job.id, scope: job.scope });
          continue;
        }
        const next = new Date(
          Date.now() + Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7)) * 1000,
        );
        // A failed sweep may already have deleted late files. Invalidate again on retry.
        const resetPurge = !["CLEANUP_PURGE_PENDING", "CLEANUP_PURGE_POLL_CHECKPOINT"].includes(
          code,
        );
        const resetOperations =
          !storageVerified || sweepChangedStorage ||
          code === "CLEANUP_CDN_OPERATION_FAILED" ||
          code === "CLEANUP_CDN_HTTP_404";
        const retried = await retryAccountStorageJob(job,token,next,code,resetPurge,resetOperations);
        if (retried !== 1) continue;
        logger.warn("Account storage cleanup will retry", {
          jobId: job.id,
          scope: job.scope,
          code,
        });
      }
    }
  } finally {
    running = false;
  }
}
