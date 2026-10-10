import type { GalleryTx } from "./ports";
/** Runs in the account-deletion transaction BEFORE User cascade. No configuration or network
 * dependency: immutable job snapshots outlive User/Album/Photo/Upload rows. */
export async function enqueueGalleryAccountCleanup(
  tx: Pick<GalleryTx, "$executeRaw">,
  ownerId: string,
  at: Date,
) {
  await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
  await tx.$executeRaw`
    INSERT INTO "GalleryStorageJob" ("id", "dedupeKey", "ownerId", "kind", "status", "sourceKeys", "sourceETags", "targetKeys", "availableAt", "attempts", "createdAt", "updatedAt")
    SELECT 'gallery-delete-' || md5(${ownerId} || ':' || k.key),
      'account:' || ${ownerId} || ':' || k.key, ${ownerId}, 'delete'::"GalleryStorageJobKind", 'pending'::"GalleryStorageJobStatus",
      ARRAY[k.key], ARRAY[]::text[], ARRAY[]::text[],
      GREATEST(${at}::timestamp, COALESCE((SELECT max(GREATEST(u."postExpiresAt", u."leaseUntil")) FROM "GalleryUpload" u WHERE u."ownerId" = ${ownerId}), ${at}::timestamp),
        COALESCE((SELECT max(j."leaseUntil") FROM "GalleryStorageJob" j WHERE j."ownerId" = ${ownerId}), ${at}::timestamp)) + interval '60 seconds',
      0, ${at}, ${at}
    FROM (
      SELECT unnest(ARRAY[p."thumbKey", p."fullKey"]) AS key FROM "GalleryPhoto" p WHERE p."ownerId" = ${ownerId}
      UNION SELECT unnest(ARRAY[u."sourceKey", u."stagedThumbKey", u."stagedFullKey"]) FROM "GalleryUpload" u WHERE u."ownerId" = ${ownerId}
      UNION SELECT unnest(ARRAY[a."originalKey", a."previewKey"]) FROM "PetVetAttachment" a JOIN "PetVetVisit" v ON v."id" = a."visitId" WHERE v."ownerId" = ${ownerId}
      UNION SELECT unnest(j."sourceKeys" || j."targetKeys") FROM "GalleryStorageJob" j WHERE j."ownerId" = ${ownerId} AND j."kind" <> 'delete'
    ) k WHERE k.key IS NOT NULL
    ON CONFLICT ("dedupeKey") DO NOTHING`;
  await tx.$executeRaw`UPDATE "GalleryStorageJob" SET "status" = 'cancelled', "attemptToken" = NULL, "leaseUntil" = NULL, "updatedAt" = ${at}
    WHERE "ownerId" = ${ownerId} AND "kind" <> 'delete' AND "status" IN ('pending', 'processing', 'failed')`;
}
