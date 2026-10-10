import crypto from "node:crypto";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import {
  accountStorageTargets,
  createAccountStorageCleaner,
  startAccountCdnPurge,
  accountCdnPurgeDone,
  type AccountStorageScope,
} from "@gafus/cdn-upload";
import { deleteAccountStreamFiles } from "./stream";

const logger = createWebLogger("account-storage-cleanup");
type Job = {
  id: string;
  ownerId: string;
  scope: AccountStorageScope | "stream";
  keys: string[];
  prefixes: string[];
  keyCursor: number;
  purgeOperations: string[];
  purgeAfter: Date | null;
  attempts: number;
};
let running = false;

/** Retry indefinitely, with expiring claims and token-fenced updates across worker replicas. */
export async function processAccountStorageCleanup(limit = 3) {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < limit; i++) {
      const token = crypto.randomUUID();
      const jobs = await prisma.$queryRaw<Job[]>`
        UPDATE "AccountStorageCleanup" SET "status" = 'processing', "attemptToken" = ${token},
          "leaseUntil" = timezone('UTC', now()) + interval '5 minutes', "attempts" = "attempts" + 1, "updatedAt" = timezone('UTC', now())
        WHERE "id" = (
          SELECT "id" FROM "AccountStorageCleanup"
          WHERE ("status" = 'pending' AND "availableAt" <= timezone('UTC', now()))
             OR ("status" = 'processing' AND "leaseUntil" < timezone('UTC', now()))
          ORDER BY "availableAt" FOR UPDATE SKIP LOCKED LIMIT 1
        ) RETURNING *`;
      const job = jobs[0];
      if (!job) break;
      let storageVerified = false;
      try {
        // Never sweep an existing owner, including an accidentally reused account ID.
        if (await prisma.user.findUnique({ where: { id: job.ownerId }, select: { id: true } }))
          throw new Error("CLEANUP_OWNER_EXISTS");
        if (job.scope === "stream") {
          // Bounded pages with persisted progress; failures do not lose unprocessed files.
          await deleteAccountStreamFiles(job.keys.slice(0, 10));
          const remaining = job.keys.slice(10);
          await prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "keys" = ${remaining}::text[],
            "status" = ${remaining.length ? "pending" : "done"}, "availableAt" = timezone('UTC', now()),
            "leaseUntil" = NULL, "attemptToken" = NULL, "errorCode" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
          continue;
        }
        const targets = accountStorageTargets(job.scope, job.ownerId, job.keys, job.prefixes);
        const cursor = job.keyCursor ?? 0;
        const nextCursor = Math.min(cursor + 20, targets.keys.length);
        const removed = await createAccountStorageCleaner(job.scope).sweep(
          {
            prefixes: cursor === 0 ? targets.prefixes : [],
            keys: targets.keys.slice(cursor, nextCursor),
          },
          AbortSignal.timeout(45_000),
        );
        storageVerified = true;
        if (removed > 0) {
          job.purgeOperations = [];
          await prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "purgeOperations" = ARRAY[]::text[],
            "purgeAfter" = NULL WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
        }
        if (nextCursor < targets.keys.length) {
          await prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "keyCursor" = ${nextCursor},
            "purgeAfter" = CASE WHEN ${removed > 0} THEN NULL ELSE "purgeAfter" END,
            "status" = 'pending', "availableAt" = timezone('UTC', now()), "leaseUntil" = NULL, "attemptToken" = NULL,
            "errorCode" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
          continue;
        }
        if (!job.purgeAfter || removed > 0) {
          const started = Date.now();
          const operations = await startAccountCdnPurge(
            job.scope,
            targets,
            job.purgeOperations,
            async (operations) => {
              const updated = await prisma.$executeRaw`UPDATE "AccountStorageCleanup"
              SET "purgeOperations" = ${operations}::text[], "updatedAt" = timezone('UTC', now())
              WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
              if (!updated || Date.now() - started > 60_000)
                throw new Error("CLEANUP_PURGE_CHECKPOINT");
            },
          );
          // Yandex edge purge is asynchronous and may take 15 minutes even after acceptance.
          const after = new Date(Date.now() + 15 * 60_000);
          await prisma.$executeRaw`UPDATE "AccountStorageCleanup"
            SET "purgeOperations" = ${operations}::text[], "purgeAfter" = ${after}, "keyCursor" = 0,
              "availableAt" = ${after}, "status" = 'pending', "leaseUntil" = NULL,
              "attemptToken" = NULL, "errorCode" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
        } else {
          const started = Date.now();
          if (
            job.purgeAfter.getTime() > Date.now() ||
            !(await accountCdnPurgeDone(job.purgeOperations, async (operations) => {
              const updated = await prisma.$executeRaw`UPDATE "AccountStorageCleanup"
              SET "purgeOperations" = ${operations}::text[], "updatedAt" = timezone('UTC', now())
              WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
              if (!updated || Date.now() - started > 60_000)
                throw new Error("CLEANUP_PURGE_POLL_CHECKPOINT");
            }))
          )
            throw new Error("CLEANUP_PURGE_PENDING");
          await prisma.$executeRaw`UPDATE "AccountStorageCleanup"
            SET "status" = 'done', "keys" = ARRAY[]::text[], "errorCode" = NULL,
              "leaseUntil" = NULL, "attemptToken" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
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
        const next = new Date(
          Date.now() + Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7)) * 1000,
        );
        // A failed sweep may already have deleted late files. Invalidate again on retry.
        const resetPurge = !["CLEANUP_PURGE_PENDING", "CLEANUP_PURGE_POLL_CHECKPOINT"].includes(
          code,
        );
        const resetOperations =
          !storageVerified ||
          code === "CLEANUP_CDN_OPERATION_FAILED" ||
          code === "CLEANUP_CDN_HTTP_404";
        await prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "status" = 'pending',
          "purgeAfter" = CASE WHEN ${resetPurge} THEN NULL ELSE "purgeAfter" END,
          "purgeOperations" = CASE WHEN ${resetOperations} THEN ARRAY[]::text[] ELSE "purgeOperations" END,
          "keyCursor" = CASE WHEN ${resetPurge} THEN 0 ELSE "keyCursor" END,
          "availableAt" = ${next}, "errorCode" = ${code}, "leaseUntil" = NULL,
          "attemptToken" = NULL, "updatedAt" = timezone('UTC', now())
          WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
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
