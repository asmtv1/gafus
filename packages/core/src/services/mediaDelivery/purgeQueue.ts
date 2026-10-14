import type { Prisma } from "@gafus/prisma";

/** Transactional edge-revocation outbox written ONLY after verified S3 deletion.
 * Worker invokes Beget API separately; API never handles provider API tokens.
 */
export type MediaPurgeScope = "gallery" | "feed";
const id = "[A-Za-z0-9_-]{1,128}";
const galleryPhoto = new RegExp(`^albums/${id}/${id}/photos/${id}/(?:thumb|full)\\.webp$`);
const galleryVet = new RegExp(`^users/${id}/pets/${id}/vet-visits/${id}/${id}/thumb\\.webp$`);
const feedImage = new RegExp(`^posts/${id}/${id}/attachments/${id}/(?:thumb|full|poster)\\.webp$`);
const feedSegment = new RegExp(`^posts/${id}/${id}/attachments/${id}/hls/segment-[0-9]{3,5}\\.ts$`);

export function deletedMediaPurgePaths(scope: MediaPurgeScope, keys: readonly string[]): string[] {
  if (keys.length > 1024) throw new Error("MEDIA_PURGE_TOO_MANY_KEYS");
  return [...new Set(keys.filter(key =>
    scope === "gallery" ? galleryPhoto.test(key) || galleryVet.test(key) :
      feedImage.test(key) || feedSegment.test(key),
  ))].map(key => `/${key}`);
}

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
