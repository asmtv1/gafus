import type { Prisma } from "@gafus/prisma";
import { enqueueFeedAccountCleanup } from "../feed/cleanup";
import { enqueueGalleryAccountCleanup } from "../gallery/accountCleanup";

/** Immutable snapshots have no FK to the deleted account. No network I/O in this transaction. */
export async function enqueueAccountStorageCleanup(
  tx: Prisma.TransactionClient,
  ownerId: string,
  at: Date,
) {
  await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
  // Questions disappear with all answers, including photos uploaded by other authors.
  // Lock them before collecting photos so concurrent answers cannot escape the snapshot.
  await tx.$executeRaw`SELECT "id" FROM "Question" WHERE "authorId" = ${ownerId} ORDER BY "id" FOR UPDATE`;
  await tx.$executeRaw`SELECT "id" FROM "CynologistChat" WHERE "clientUserId" = ${ownerId} ORDER BY "id" FOR UPDATE`;
  await tx.$executeRaw`
    INSERT INTO "AccountStorageCleanup" ("id", "ownerId", "scope", "keys", "prefixes", "availableAt", "createdAt", "updatedAt")
    SELECT 'account-storage-' || md5(${ownerId} || ':' || s.scope), ${ownerId}, s.scope,
      CASE WHEN s.scope = 'public' THEN ARRAY(
        SELECT DISTINCT url FROM (
          SELECT "avatarUrl" AS url FROM "UserProfile" WHERE "userId" = ${ownerId}
          UNION SELECT "photoUrl" FROM "Pet" WHERE "ownerId" = ${ownerId}
          UNION SELECT "url" FROM "PetDocument" WHERE "ownerId" = ${ownerId}
          UNION SELECT p."storagePath" FROM "QuestionPhoto" p
            LEFT JOIN "Question" q ON q."id" = p."questionId"
            LEFT JOIN "QuestionAnswer" a ON a."id" = p."answerId"
            LEFT JOIN "Question" aq ON aq."id" = a."questionId"
            WHERE p."ownerId" = ${ownerId} OR q."authorId" = ${ownerId}
              OR a."authorId" = ${ownerId} OR aq."authorId" = ${ownerId}
          UNION SELECT e."videoReportUrl" FROM "ExamResult" e
            LEFT JOIN "UserStep" us ON us."id" = e."userStepId"
            LEFT JOIN "UserTraining" ut ON ut."id" = us."userTrainingId"
            LEFT JOIN "DailyCourseUserStep" ds ON ds."id" = e."dailyCourseUserStepId"
            LEFT JOIN "DailyCourseUserTraining" dt ON dt."id" = ds."dailyCourseUserTrainingId"
            WHERE ut."userId" = ${ownerId} OR dt."userId" = ${ownerId}
        ) assets WHERE url IS NOT NULL AND url <> ''
      ) ELSE ARRAY[]::text[] END,
      CASE WHEN s.scope = 'public' THEN ARRAY(
        SELECT 'uploads/exams/' || us."id" || '/' FROM "UserStep" us
          JOIN "UserTraining" ut ON ut."id" = us."userTrainingId" WHERE ut."userId" = ${ownerId}
        UNION SELECT 'uploads/exams/' || ds."id" || '/' FROM "DailyCourseUserStep" ds
          JOIN "DailyCourseUserTraining" dt ON dt."id" = ds."dailyCourseUserTrainingId" WHERE dt."userId" = ${ownerId}
      ) ELSE ARRAY[]::text[] END,
      GREATEST(${at}::timestamp,
        COALESCE((SELECT max("postExpiresAt") FROM "GalleryUpload" WHERE "ownerId" = ${ownerId}), ${at}::timestamp),
        COALESCE((SELECT max("postExpiresAt") FROM "FeedUpload" WHERE "ownerId" = ${ownerId}), ${at}::timestamp),
        COALESCE((SELECT max("leaseUntil") FROM "GalleryStorageJob" WHERE "ownerId" = ${ownerId}), ${at}::timestamp),
        COALESCE((SELECT max("availableAt") FROM "GalleryStorageJob" WHERE "ownerId" = ${ownerId} AND "dedupeKey" LIKE 'vet-upload:%'), ${at}::timestamp),
        COALESCE((SELECT max("leaseUntil") FROM "FeedStorageJob" WHERE "ownerId" = ${ownerId}), ${at}::timestamp)
      ) + interval '10 minutes', ${at}, ${at}
    FROM (VALUES ('public'), ('gallery'), ('feed')) s(scope)
    ON CONFLICT ("ownerId", "scope") DO NOTHING`;
  await tx.$executeRaw`
    INSERT INTO "AccountStorageCleanup" ("id", "ownerId", "scope", "keys", "availableAt", "createdAt", "updatedAt")
    SELECT 'account-stream-' || md5(${ownerId}), ${ownerId}, 'stream',
      array_agg(json_build_object('url', f.url, 'kind', f.kind, 'channelType', f.type, 'channelId', f.channel)::text),
      ${at}::timestamp + interval '10 minutes', ${at}, ${at}
    FROM (
      SELECT a."url" AS url, a."kind" AS kind, 'gafus_cynologist' AS type, c."streamChannelId" AS channel
        FROM "ChatAttachment" a JOIN "CynologistChat" c ON c."id" = a."chatId"
        WHERE a."ownerUserId" = ${ownerId} OR c."clientUserId" = ${ownerId}
      UNION SELECT "url", "kind", 'gafus_community', 'general'
        FROM "CommunityChatAttachment" WHERE "ownerUserId" = ${ownerId}
    ) f HAVING count(*) > 0
    ON CONFLICT ("ownerId", "scope") DO NOTHING`;
  await enqueueGalleryAccountCleanup(tx, ownerId, at);
  await enqueueFeedAccountCleanup(tx, ownerId, at);
}
