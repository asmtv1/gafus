/** Owner-injected, bounded SQL stats snapshot for Smart Feed. The source list
 * has already been authorized by Core for publication, visibility and author
 * preferences. Use parameterized Prisma.sql/Prisma.join, never string SQL.
 */
import { Prisma, prisma } from "@gafus/prisma";

export interface SmartFeedPostStats {
  postId: string;
  reactions: number;
  uniqueCommenters: number;
  bookmarks: number;
  impressions: number;
}

/** A caller performing an isolated SQL acceptance test supplies its own
 * transaction, so the aggregate read sees uncommitted fixture rows and rolls
 * back with the rest of that test. Production defaults to the shared client.
 */
export async function readSmartFeedPostStats(
  postIds: readonly string[], at: Date,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<SmartFeedPostStats[]> {
  if (!postIds.length) return [];
  if (postIds.length > 400) throw new Error("SMART_FEED_POST_BATCH_EXCEEDED");
  const boundedIds = [...postIds];
  return db.$queryRaw<SmartFeedPostStats[]>(Prisma.sql`
      WITH fresh AS (
        SELECT s.* FROM "FeedPostStats" s
        WHERE s."postId" IN (${Prisma.join(boundedIds)})
          AND s."updatedAt" >= ${new Date(at.getTime() - 5 * 60_000)}
      )
      SELECT p."id" AS "postId",
             COALESCE(s."reactionCount", r.n, 0)::integer AS reactions,
             COALESCE(s."uniqueCommenterCount", c.n, 0)::integer AS "uniqueCommenters",
             COALESCE(s."bookmarkCount", b.n, 0)::integer AS bookmarks,
             COALESCE(s."qualifiedImpressionCount", 0)::integer AS impressions
      FROM "FeedPost" p
      LEFT JOIN fresh s ON s."postId" = p."id"
      LEFT JOIN (
        SELECT r."postId", COUNT(*)::integer AS n
        FROM "FeedPostReaction" r
        JOIN "FeedPost" post ON post."id" = r."postId"
        LEFT JOIN fresh f ON f."postId" = r."postId"
        WHERE r."postId" IN (${Prisma.join(boundedIds)}) AND f."postId" IS NULL
          AND r."userId" <> post."authorId"
        GROUP BY r."postId"
      ) r ON r."postId" = p."id"
      LEFT JOIN (
        SELECT c."postId", COUNT(DISTINCT c."authorId")::integer AS n
        FROM "FeedComment" c
        JOIN "FeedPost" post ON post."id" = c."postId"
        LEFT JOIN fresh f ON f."postId" = c."postId"
        WHERE c."postId" IN (${Prisma.join(boundedIds)})
          AND f."postId" IS NULL
          AND c."deletedAt" IS NULL AND c."moderationState" = 'visible'
          AND c."authorId" <> post."authorId"
        GROUP BY c."postId"
      ) c ON c."postId" = p."id"
      LEFT JOIN (
        SELECT b."postId", COUNT(*)::integer AS n
        FROM "FeedBookmark" b
        JOIN "FeedPost" post ON post."id" = b."postId"
        LEFT JOIN fresh f ON f."postId" = b."postId"
        WHERE b."postId" IN (${Prisma.join(boundedIds)}) AND f."postId" IS NULL
          AND b."userId" <> post."authorId"
        GROUP BY b."postId"
      ) b ON b."postId" = p."id"
      WHERE p."id" IN (${Prisma.join(boundedIds)})
    `);
}
