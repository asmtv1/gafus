import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";

/** Refresh a bounded moving window; never run unbounded COUNTs over all history. */
export async function refreshSmartFeedStats(db: FeedDb, limit = 1200): Promise<number> {
  const count = Math.max(1, Math.min(3000, Math.trunc(limit)));
  const result = await db.$queryRaw<{ updated: number }[]>(Prisma.sql`
    WITH candidates AS (
      SELECT p."id", p."authorId"
      FROM "FeedPost" p
      WHERE p."status" = 'published'::"FeedPostStatus"
        AND p."deletedAt" IS NULL AND p."moderationState" = 'visible'
        AND p."publishedAt" >= CURRENT_TIMESTAMP - INTERVAL '14 days'
      ORDER BY p."publishedAt" DESC, p."id" DESC
      LIMIT ${count}
    ), reactions AS (
      SELECT r."postId", COUNT(*)::integer AS n
      FROM "FeedPostReaction" r JOIN candidates p ON p."id" = r."postId"
      WHERE r."userId" <> p."authorId"
      GROUP BY r."postId"
    ), commenters AS (
      SELECT c."postId", COUNT(DISTINCT c."authorId")::integer AS n
      FROM "FeedComment" c JOIN candidates p ON p."id" = c."postId"
      WHERE c."authorId" <> p."authorId" AND c."deletedAt" IS NULL
        AND c."moderationState" = 'visible'
      GROUP BY c."postId"
    ), bookmarks AS (
      SELECT b."postId", COUNT(*)::integer AS n
      FROM "FeedBookmark" b JOIN candidates p ON p."id" = b."postId"
      WHERE b."userId" <> p."authorId"
      GROUP BY b."postId"
    ), views AS (
      SELECT v."postId", COUNT(*)::integer AS n
      FROM "FeedPostView" v JOIN candidates p ON p."id" = v."postId"
      WHERE v."userId" <> p."authorId"
      GROUP BY v."postId"
    ), impressions AS (
      SELECT i."postId", COUNT(*)::integer AS n
      FROM "FeedImpression" i JOIN candidates p ON p."id" = i."postId"
      WHERE i."userId" <> p."authorId"
      GROUP BY i."postId"
    ), updated AS (
      INSERT INTO "FeedPostStats" (
        "postId", "reactionCount", "uniqueCommenterCount", "bookmarkCount",
        "uniqueViewCount", "qualifiedImpressionCount", "updatedAt"
      )
      SELECT p."id",
        COALESCE(r.n, 0), COALESCE(c.n, 0), COALESCE(b.n, 0),
        COALESCE(v.n, 0), COALESCE(i.n, 0), CURRENT_TIMESTAMP
      FROM candidates p
      LEFT JOIN reactions r ON r."postId" = p."id"
      LEFT JOIN commenters c ON c."postId" = p."id"
      LEFT JOIN bookmarks b ON b."postId" = p."id"
      LEFT JOIN views v ON v."postId" = p."id"
      LEFT JOIN impressions i ON i."postId" = p."id"
      ON CONFLICT ("postId") DO UPDATE SET
        "reactionCount" = EXCLUDED."reactionCount",
        "uniqueCommenterCount" = EXCLUDED."uniqueCommenterCount",
        "bookmarkCount" = EXCLUDED."bookmarkCount",
        "uniqueViewCount" = EXCLUDED."uniqueViewCount",
        "qualifiedImpressionCount" = EXCLUDED."qualifiedImpressionCount",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "postId"
    )
    SELECT COUNT(*)::integer AS updated FROM updated
  `);
  return result[0]?.updated ?? 0;
}
