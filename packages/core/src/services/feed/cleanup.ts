import type { FeedTx } from "./ports";
/** Include deterministic outputs even when a crashed attempt never stored its result in the DB. */
export function feedPossibleOutputKeys(ownerId: string, postId: string, mediaId: string,
  kind: "photo" | "video" = "video") {
  const base = `media/v2/${mediaId}/v1/`;
  const outputs = kind === "photo"
    ? ["image/s.webp", "image/m.webp", "image/l.webp"]
    : ["poster.webp", "video/360.mp4", "video/720.mp4"];
  return outputs.map(name => base + name);
}
export async function enqueueFeedPostCleanup(tx: FeedTx, postId: string, ownerId: string, at: Date, reason: string) {
  const [media, uploads, jobs] = await Promise.all([
    tx.feedMediaAsset.findMany({ where: { postId } }), tx.feedUpload.findMany({ where: { postId } }),
    tx.feedStorageJob.findMany({ where: { postId, kind: { notIn: ["delete_keys", "cleanup_source"] } } }),
  ]);
  const prefix = `posts/${ownerId}/${postId}/`;
  const keys = [...new Set([
    ...uploads.map(item => item.sourceKey),
    ...media.flatMap(item => [item.smallKey, item.thumbKey, item.fullKey, item.posterKey, ...(item.mp4Keys ?? []),
      ...feedPossibleOutputKeys(ownerId, postId, item.id, item.kind)]),
    ...jobs.flatMap(item => [...item.sourceKeys, ...item.targetKeys]),
  ].filter((key): key is string => !!key && (key.startsWith(prefix) ||
    // The post may have received media from commenters with their own source keys.
    uploads.some(upload => upload.sourceKey === key &&
      key.startsWith("posts/" + upload.ownerId + "/" + postId + "/")) ||
    media.some(item => key.startsWith(`media/v2/${item.id}/v1/`)))))];
  const deadline = Math.max(at.getTime(),
    ...uploads.flatMap(item => [item.postExpiresAt.getTime(), item.reservationExpiresAt.getTime()]),
    ...jobs.map(item => item.leaseUntil?.getTime() ?? 0));
  await tx.feedStorageJob.updateMany({
    where: { postId, kind: { notIn: ["delete_keys", "cleanup_source"] }, status: { in: ["pending", "processing"] } },
    data: { status: "failed", attemptToken: null, leaseUntil: null, errorCode: "POST_DELETED" },
  });
  for (let offset = 0; offset < keys.length; offset += 20) {
    const dedupeKey = `feed-cleanup:${reason}:${postId}` + (offset ? `:${offset / 20}` : "");
    await tx.feedStorageJob.upsert({ where: { dedupeKey },
      create: { dedupeKey, ownerId, postId, kind: "delete_keys", sourceKeys: keys.slice(offset, offset + 20),
        availableAt: new Date(deadline + 60_000) }, update: {},
    });
  }
}
/** Snapshot jobs deliberately have no foreign key to User/Post and survive account cascade. */
export async function enqueueFeedAccountCleanup(tx: Pick<FeedTx, "$executeRaw">, ownerId: string, at: Date) {
  await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
  await tx.$executeRaw`SELECT "id" FROM "FeedPost" WHERE "authorId" = ${ownerId} ORDER BY "id" FOR UPDATE`;
  await tx.$executeRaw`
    INSERT INTO "FeedStorageJob" ("id", "dedupeKey", "ownerId", "kind", "status", "sourceKeys", "targetKeys", "availableAt", "attempts", "createdAt", "updatedAt")
    SELECT 'feed-delete-' || md5(${ownerId} || ':' || k.key), 'account:' || ${ownerId} || ':' || k.key,
      ${ownerId}, 'delete_keys'::"FeedJobKind", 'pending'::"FeedJobStatus", ARRAY[k.key], ARRAY[]::text[],
      GREATEST(${at}::timestamp,
        COALESCE((SELECT max(GREATEST(u."postExpiresAt", u."reservationExpiresAt"))
          FROM "FeedUpload" u WHERE u."ownerId" = ${ownerId}), ${at}::timestamp),
        COALESCE((SELECT max(j."leaseUntil") FROM "FeedStorageJob" j WHERE j."ownerId" = ${ownerId}), ${at}::timestamp)) + interval '60 seconds',
      0, ${at}, ${at}
    FROM (
      SELECT unnest(ARRAY[m."smallKey", m."thumbKey", m."fullKey", m."posterKey"] || m."mp4Keys") AS key
        FROM "FeedMediaAsset" m WHERE m."ownerId" = ${ownerId}
      UNION SELECT u."sourceKey" FROM "FeedUpload" u WHERE u."ownerId" = ${ownerId}
      UNION SELECT unnest(j."sourceKeys" || j."targetKeys") FROM "FeedStorageJob" j WHERE j."ownerId" = ${ownerId}
      UNION SELECT 'media/v2/' || m."id" || '/v1/' || v.name
        FROM "FeedMediaAsset" m CROSS JOIN (VALUES
          ('image/s.webp'), ('image/m.webp'), ('image/l.webp'),
          ('poster.webp'), ('video/360.mp4'), ('video/720.mp4')) v(name)
        WHERE m."ownerId" = ${ownerId}
    ) k WHERE k.key IS NOT NULL AND (
      left(k.key, length('posts/' || ${ownerId} || '/')) = 'posts/' || ${ownerId} || '/'
      OR EXISTS (SELECT 1 FROM "FeedMediaAsset" m
        WHERE m."ownerId" = ${ownerId} AND k.key LIKE 'media/v2/' || m."id" || '/v1/%'))
    ON CONFLICT ("dedupeKey") DO NOTHING`;
  await tx.$executeRaw`UPDATE "FeedStorageJob" SET "status" = 'failed', "attemptToken" = NULL, "leaseUntil" = NULL,
    "errorCode" = 'ACCOUNT_DELETED', "updatedAt" = ${at}
    WHERE "ownerId" = ${ownerId} AND "kind" NOT IN ('delete_keys', 'cleanup_source') AND "status" IN ('pending', 'processing')`;
}
