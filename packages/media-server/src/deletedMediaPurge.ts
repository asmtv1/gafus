import type { Prisma } from "@gafus/prisma";
import { deletedMediaPurgePaths, type MediaPurgeScope } from "@gafus/media-shared/purge-paths";

/** Preserve stable compiled media-server exports for both runtime images. */
export { deletedMediaPurgePaths } from "@gafus/media-shared/purge-paths";
export type { MediaPurgeScope } from "@gafus/media-shared/purge-paths";

export async function enqueueDeletedMediaPurge(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  scope: MediaPurgeScope,
  jobId: string,
  deletedKeys: readonly string[],
  env: Record<string, string | undefined> = process.env,
) {
  if (env[`${scope.toUpperCase()}_CDN_PROVIDER`] !== "beget") return;
  if (env[`${scope.toUpperCase()}_S3_ENDPOINT`] !== "https://s3.cloud.ru")
    throw new Error("MEDIA_PURGE_STORAGE_UNVERIFIED");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new Error("MEDIA_PURGE_INVALID_JOB_ID");
  const paths = deletedMediaPurgePaths(scope, deletedKeys);
  if (!paths.length) return;
  const id = `${scope}:${jobId}`;
  // The parent S3 delete callback and the durable CDN job commit atomically.
  // Crash/retry cannot lose or duplicate the revocation event.
  await tx.$executeRaw`
    INSERT INTO "MediaCdnPurge" ("id", "scope", "paths", "status", "availableAt", "updatedAt")
    VALUES (${id}, ${scope}, ${paths}::text[], 'pending', timezone('UTC', now()), timezone('UTC', now()))
    ON CONFLICT ("id") DO NOTHING`;
}
