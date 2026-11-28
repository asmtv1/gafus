/** Durable cross-domain CDN invalidation queue. The Worker sees only a typed repository. */
import { prisma } from "@gafus/prisma";

export type EdgePurgeJob = {
  id: string;
  scope: string;
  paths: string[];
  purgeOperations: string[];
  attemptToken: string;
  attempts: number;
};

export type MediaCdnPurgeRepository = {
  claim(token: string): Promise<EdgePurgeJob | undefined>;
  checkpoint(job: EdgePurgeJob, operations: string[]): Promise<void>;
  complete(job: EdgePurgeJob): Promise<void>;
  retry(job: EdgePurgeJob, code: string, retryMs: number): Promise<void>;
};

export function createMediaCdnPurgeRepository(): MediaCdnPurgeRepository {
  return {
    async claim(token) {
      const rows = await prisma.$queryRaw<EdgePurgeJob[]>`
        UPDATE "MediaCdnPurge" SET "status" = 'processing', "attemptToken" = ${token},
          "attempts" = "attempts" + 1,
          "leaseUntil" = timezone('UTC', now()) + interval '10 minutes',
          "updatedAt" = timezone('UTC', now())
        WHERE "id" = (
          SELECT "id" FROM "MediaCdnPurge"
          WHERE ("status" = 'pending' AND "availableAt" <= timezone('UTC', now()))
             OR ("status" = 'processing' AND "leaseUntil" < timezone('UTC', now()))
          ORDER BY "availableAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
        ) RETURNING *`;
      return rows[0];
    },
    async checkpoint(job, operations) {
      const written = await prisma.$executeRaw`
        UPDATE "MediaCdnPurge" SET "purgeOperations" = ${operations}::text[],
          "updatedAt" = timezone('UTC', now())
        WHERE "id" = ${job.id} AND "attemptToken" = ${job.attemptToken}
          AND "status" = 'processing' AND "leaseUntil" > timezone('UTC', now())`;
      if (written !== 1) throw new Error("MEDIA_PURGE_LEASE_LOST");
      job.purgeOperations = [...operations];
    },
    async complete(job) {
      const written = await prisma.$executeRaw`
        UPDATE "MediaCdnPurge" SET "status" = 'done', "paths" = ARRAY[]::text[],
          "purgeOperations" = ARRAY[]::text[], "attemptToken" = NULL,
          "leaseUntil" = NULL, "errorCode" = NULL, "updatedAt" = timezone('UTC', now())
        WHERE "id" = ${job.id} AND "attemptToken" = ${job.attemptToken}
          AND "status" = 'processing' AND "leaseUntil" > timezone('UTC', now())`;
      if (written !== 1) throw new Error("MEDIA_PURGE_LEASE_LOST");
    },
    async retry(job, code, delay) {
      const written = await prisma.$executeRaw`
        UPDATE "MediaCdnPurge" SET "status" = 'pending', "attemptToken" = NULL,
          "leaseUntil" = NULL, "errorCode" = ${code},
          "availableAt" = ${new Date(Date.now() + delay)}, "updatedAt" = timezone('UTC', now())
        WHERE "id" = ${job.id} AND "attemptToken" = ${job.attemptToken}
          AND "status" = 'processing' AND "leaseUntil" > timezone('UTC', now())`;
      if (written !== 1) throw new Error("MEDIA_PURGE_LEASE_LOST");
    },
  };
}

/** One aggregate read; no keys, receipts, owner IDs or provider payload leave persistence. */
export async function readMediaCdnPurgeMetrics() {
  const [row] = await prisma.$queryRaw<{
    pending: number; expired: number; oldestAgeSeconds: number;
  }[]>
    `SELECT count(*)::int AS pending,
      count(*) FILTER (WHERE "status" = 'processing'
        AND ("leaseUntil" IS NULL OR "leaseUntil" <= timezone('UTC', now())))::int AS expired,
      COALESCE(GREATEST(0, EXTRACT(EPOCH FROM timezone('UTC', now()) - min("createdAt"))), 0)::double precision AS "oldestAgeSeconds"
    FROM "MediaCdnPurge" WHERE "status" IN ('pending', 'processing')`;
  if (!row) throw new Error("MEDIA_PURGE_METRICS_EMPTY");
  return row;
}
