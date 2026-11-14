/** Ranked feed SQL lives on the infrastructure side; keyset timestamp remains UTC-naive. */
import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./mediaDbPorts";
export type RankedFeedPosition = { score: number; publishedAt: Date; id: string };
export async function readRankedFeedRows(
  db: FeedDb,
  actorId: string,
  sort: "popular" | "discussed",
  cursor: RankedFeedPosition | null,
  pageSize: number,
) {
  const scoreSql =
    sort === "popular"
      ? Prisma.sql`(SELECT COUNT(*)::integer FROM "FeedPostReaction" r WHERE r."postId" = p."id")`
      : Prisma.sql`(SELECT COUNT(*)::integer FROM "FeedComment" c WHERE c."postId" = p."id" AND c."deletedAt" IS NULL AND c."moderationState" = 'visible')`;
  // FeedPost.publishedAt is TIMESTAMP(3) WITHOUT TIME ZONE.
  // Binding a JS Date as TIMESTAMPTZ changes keyset order on non-UTC servers,
  // potentially repeating the same page forever. Use an explicit UTC-naive
  // timestamp string in the SQL comparisons.
  const utcCursorTime = cursor?.publishedAt.toISOString().slice(0, 23).replace("T", " ");
  const afterCursor = cursor
    ? Prisma.sql`WHERE ranked.score < ${cursor.score}
            OR (ranked.score = ${cursor.score} AND ranked."publishedAt" < ${utcCursorTime}::timestamp(3))
            OR (ranked.score = ${cursor.score} AND ranked."publishedAt" = ${utcCursorTime}::timestamp(3) AND ranked.id < ${cursor.id})`
    : Prisma.empty;
  const ranked = await db.$queryRaw<{ id: string; publishedAt: Date; score: number }[]>(Prisma.sql`
          SELECT ranked.id, ranked."publishedAt", ranked.score FROM (
            SELECT p."id", p."publishedAt", ${scoreSql} AS score
            FROM "FeedPost" p
            WHERE p."status" = 'published'::"FeedPostStatus"
              AND p."deletedAt" IS NULL AND p."moderationState" = 'visible'
              AND p."publishedAt" IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM "FeedAuthorPreference" pref
                WHERE pref."userId" = ${actorId} AND pref."authorId" = p."authorId" AND pref."hidden" = true
              )
          ) ranked
          ${afterCursor}
          ORDER BY ranked.score DESC, ranked."publishedAt" DESC, ranked.id DESC
          LIMIT ${pageSize + 1}
        `);
  return ranked;
}
