import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";

export interface SmartFeedHealth {
  hour: string;
  exposedUsers: number;
  qualifiedImpressions: number;
  distinctPosts: number;
  distinctAuthors: number;
  postOpens: number;
  longDwells: number;
  notInterested: number;
  exposureRateWarning: boolean;
  authorConcentrationWarning: boolean;
  outcomeCaptureWarning: boolean;
}

type SummaryRow = {
  exposedUsers: number;
  qualifiedImpressions: number;
  distinctPosts: number;
  distinctAuthors: number;
  postOpens: number;
  longDwells: number;
  notInterested: number;
  maxAuthorImpressions: number;
};

/** Privacy-safe aggregate counters. Never logs actor IDs, cities or breeds. */
export async function getSmartFeedHealth(
  db: FeedDb, at = new Date(), hours = 1,
): Promise<SmartFeedHealth> {
  const period = Math.max(1, Math.min(24, Math.trunc(hours)));
  const from = new Date(at.getTime() - period * 3_600_000);
  const rows = await db.$queryRaw<SummaryRow[]>(Prisma.sql`
    WITH shown AS (
      SELECT i."userId", i."postId", i."rankingSessionId", p."authorId"
      FROM "FeedImpression" i
      JOIN "FeedPost" p ON p.id = i."postId"
      WHERE i."occurredAt" >= ${from} AND i."occurredAt" < ${at}
    ), author_counts AS (
      SELECT "authorId", COUNT(*) AS n FROM shown GROUP BY "authorId"
    )
    SELECT
      (SELECT COUNT(DISTINCT "userId")::integer FROM shown) AS "exposedUsers",
      (SELECT COUNT(*)::integer FROM shown) AS "qualifiedImpressions",
      (SELECT COUNT(DISTINCT "postId")::integer FROM shown) AS "distinctPosts",
      (SELECT COUNT(DISTINCT "authorId")::integer FROM shown) AS "distinctAuthors",
      (SELECT COUNT(*)::integer FROM "FeedRankingEvent" e
        WHERE e.kind = 'post_open' AND e."createdAt" >= ${from} AND e."createdAt" < ${at}) AS "postOpens",
      (SELECT COUNT(*)::integer FROM "FeedRankingEvent" e
        WHERE e.kind = 'dwell' AND e."durationMs" >= 8000
          AND e."createdAt" >= ${from} AND e."createdAt" < ${at}) AS "longDwells",
      (SELECT COUNT(*)::integer FROM "FeedUserPostFeedback" n
        WHERE n.kind = 'not_interested' AND n."createdAt" >= ${from} AND n."createdAt" < ${at}) AS "notInterested",
      COALESCE((SELECT MAX(n)::integer FROM author_counts),0) AS "maxAuthorImpressions"
  `);
  const r = rows[0] ?? {
    exposedUsers: 0, qualifiedImpressions: 0, distinctPosts: 0,
    distinctAuthors: 0, postOpens: 0, longDwells: 0,
    notInterested: 0, maxAuthorImpressions: 0,
  };
  // Conservative diagnostics, not a live kill-switch; product thresholds
  // must be calibrated after baseline telemetry.
  return {
    hour: from.toISOString(), ...r,
    exposureRateWarning: r.qualifiedImpressions > 0 && r.exposedUsers === 0,
    authorConcentrationWarning: r.qualifiedImpressions >= 100 &&
      r.maxAuthorImpressions / r.qualifiedImpressions > 0.5,
    outcomeCaptureWarning: r.qualifiedImpressions >= 100 &&
      r.postOpens === 0 && r.longDwells === 0,
  };
}
