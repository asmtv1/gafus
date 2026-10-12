import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";

/**
 * Materialize decayed user → author preferences for recently active viewers.
 * Only observable interactions after the viewer's history-reset cutoff count.
 * A single SQL operation updates at most `limit` active viewers per run.
 */
export async function refreshSmartAuthorAffinities(db: FeedDb, limit = 200): Promise<number> {
  const count = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const updated = await db.$queryRaw<{ updated: number }[]>(Prisma.sql`
    WITH active AS (
      SELECT i."userId", MAX(i."occurredAt") AS last_seen
      FROM "FeedImpression" i
      LEFT JOIN "FeedPersonalizationPreference" pref ON pref."userId" = i."userId"
      WHERE i."occurredAt" > CURRENT_TIMESTAMP - INTERVAL '1 day'
        AND COALESCE(pref.enabled, TRUE) = TRUE
        AND COALESCE(pref."useBehavior", TRUE) = TRUE
      GROUP BY i."userId"
      ORDER BY last_seen DESC, i."userId"
      LIMIT ${count}
    ), cutoffs AS (
      SELECT a."userId", GREATEST(
        CURRENT_TIMESTAMP - INTERVAL '90 days',
        COALESCE(pref."historyResetAt", CURRENT_TIMESTAMP - INTERVAL '90 days')
      ) AS since
      FROM active a LEFT JOIN "FeedPersonalizationPreference" pref ON pref."userId" = a."userId"
    ), signals AS (
      SELECT r."userId" AS viewer, p."authorId" AS author, r."createdAt" AS time,
             1.5::double precision AS weight,
             1 AS reactions, 0 AS comments, 0 AS bookmarks, 0 AS views
      FROM "FeedPostReaction" r JOIN cutoffs c ON c."userId" = r."userId"
      JOIN "FeedPost" p ON p.id = r."postId"
      WHERE r."createdAt" >= c.since AND r."userId" <> p."authorId"
      UNION ALL
      SELECT m."authorId", p."authorId", m."createdAt",
             2.5::double precision, 0, 1, 0, 0
      FROM "FeedComment" m JOIN cutoffs c ON c."userId" = m."authorId"
      JOIN "FeedPost" p ON p.id = m."postId"
      WHERE m."createdAt" >= c.since AND m."deletedAt" IS NULL
        AND m."moderationState" = 'visible' AND m."authorId" <> p."authorId"
      UNION ALL
      SELECT b."userId", p."authorId", b."createdAt",
             3::double precision, 0, 0, 1, 0
      FROM "FeedBookmark" b JOIN cutoffs c ON c."userId" = b."userId"
      JOIN "FeedPost" p ON p.id = b."postId"
      WHERE b."createdAt" >= c.since AND b."userId" <> p."authorId"
      UNION ALL
      SELECT v."userId", p."authorId", MIN(v."occurredAt"),
             0.2::double precision, 0, 0, 0, 1
      FROM "FeedImpression" v JOIN cutoffs c ON c."userId" = v."userId"
      JOIN "FeedPost" p ON p.id = v."postId"
      WHERE v."occurredAt" >= c.since AND v."userId" <> p."authorId"
      GROUP BY v."userId", p."authorId", v."postId"
    ), features AS (
      SELECT viewer, author,
             SUM(weight * EXP(-LN(2) * GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - time))) / (30 * 86400)))::double precision AS score,
             SUM(reactions)::integer AS reactions, SUM(comments)::integer AS comments,
             SUM(bookmarks)::integer AS bookmarks, SUM(views)::integer AS views,
             MAX(time) AS last_interaction
      FROM signals GROUP BY viewer, author
    ), inserted AS (
      INSERT INTO "FeedUserAuthorAffinity" (
        "userId", "authorId", score, "reactionCount", "commentCount",
        "bookmarkCount", "qualifiedViewCount", "lastInteractionAt", "updatedAt"
      )
      SELECT viewer, author, score, reactions, comments, bookmarks, views,
             last_interaction, CURRENT_TIMESTAMP
      FROM features WHERE score > 0
      ON CONFLICT ("userId", "authorId") DO UPDATE SET
        score = EXCLUDED.score,
        "reactionCount" = EXCLUDED."reactionCount",
        "commentCount" = EXCLUDED."commentCount",
        "bookmarkCount" = EXCLUDED."bookmarkCount",
        "qualifiedViewCount" = EXCLUDED."qualifiedViewCount",
        "lastInteractionAt" = EXCLUDED."lastInteractionAt",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "userId"
    )
    SELECT COUNT(*)::integer AS updated FROM inserted
  `);
  return updated[0]?.updated ?? 0;
}
