import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";

export interface SmartExperimentArm {
  variant: "control" | "treatment";
  users: number;
  engagedUsers: number;
  negativeUsers: number;
  postOpenedUsers: number;
  longDwellUsers: number;
  postOpenRate: number;
  longDwellRate: number;
  postsExposed: number;
  authorsExposed: number;
  engagementRate: number;
  negativeRate: number;
}

interface ExperimentAggregateRow {
  variant: "control" | "treatment";
  users: number;
  engagedUsers: number;
  negativeUsers: number;
  postOpenedUsers: number;
  longDwellUsers: number;
  postsExposed: number;
  authorsExposed: number;
}

export interface SmartExperimentReport {
  from: string;
  toExclusive: string;
  windowDays: number;
  eventWindowDays: 7;
  arms: SmartExperimentArm[];
  comparison: {
    absoluteDifference: number;
    relativeLift: number | null;
    confidenceInterval95: [number, number];
    eligibleForDecision: boolean;
  } | null;
}

function rate(count: number, total: number): number {
  return total ? count / total : 0;
}

/** Wilson interval for a binomial rate, less misleading than Wald for small samples. */
export function wilson95(success: number, total: number): [number, number] {
  if (!total) return [0, 1];
  const z = 1.959963984540054, z2 = z * z, p = rate(success, total);
  const middle = (p + z2 / (2 * total)) / (1 + z2 / total);
  const margin = z / (1 + z2 / total) *
    Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return [Math.max(0, middle - margin), Math.min(1, middle + margin)];
}

/**
 * User is the randomization and analysis unit. Select only that user's first
 * mature eligible experiment day, then attribute engagement to a verified post
 * exposure within the following seven days. Do not aggregate raw clicks or
 * use non-exposed posts as negative examples.
 */
export async function getSmartExperimentReport(
  db: FeedDb, at = new Date(), days = 30,
): Promise<SmartExperimentReport> {
  const windowDays = Math.max(8, Math.min(90, Math.trunc(days)));
  const to = new Date(at.getTime() - 8 * 86_400_000);
  const from = new Date(at.getTime() - windowDays * 86_400_000);
  const result = await db.$queryRaw<ExperimentAggregateRow[]>(Prisma.sql`
    WITH eligible AS (
      SELECT i."userId", i."postId", i."rankingSessionId", i."occurredAt", i."experimentVariant",
             p."authorId",
             MIN(i."occurredAt") OVER (PARTITION BY i."userId") AS first_seen
      FROM "FeedImpression" i
      JOIN "FeedPost" p ON p."id" = i."postId"
      WHERE i."occurredAt" >= ${from} AND i."occurredAt" < ${to}
        AND i."experimentVariant" IN ('control', 'treatment')
    ), exposures AS (
      SELECT e.* FROM eligible e
      WHERE e."occurredAt" < DATE_TRUNC('day', e.first_seen) + INTERVAL '1 day'
        AND e."experimentVariant" = (
          SELECT x."experimentVariant"
          FROM eligible x WHERE x."userId" = e."userId"
          ORDER BY x."occurredAt", x."postId" LIMIT 1
        )
    ), outcomes AS (
      SELECT e."userId", e."experimentVariant", e."postId", e."authorId",
        (
          EXISTS (SELECT 1 FROM "FeedPostReaction" r
            WHERE r."userId" = e."userId" AND r."postId" = e."postId"
              AND r."createdAt" >= e."occurredAt"
              AND r."createdAt" < e."occurredAt" + INTERVAL '7 days')
          OR EXISTS (SELECT 1 FROM "FeedBookmark" b
            WHERE b."userId" = e."userId" AND b."postId" = e."postId"
              AND b."createdAt" >= e."occurredAt"
              AND b."createdAt" < e."occurredAt" + INTERVAL '7 days')
          OR EXISTS (SELECT 1 FROM "FeedComment" c
            WHERE c."authorId" = e."userId" AND c."postId" = e."postId"
              AND c."createdAt" >= e."occurredAt"
              AND c."createdAt" < e."occurredAt" + INTERVAL '7 days'
              AND c."deletedAt" IS NULL AND c."moderationState" = 'visible')
        ) AS meaningful,
        EXISTS (SELECT 1 FROM "FeedRankingEvent" opened
          WHERE opened."userId" = e."userId" AND opened."postId" = e."postId"
            AND opened."rankingSessionId" = e."rankingSessionId"
            AND opened.kind = 'post_open'
            AND opened."createdAt" >= e."occurredAt"
            AND opened."createdAt" < e."occurredAt" + INTERVAL '7 days') AS opened,
        EXISTS (SELECT 1 FROM "FeedRankingEvent" dwell
          WHERE dwell."userId" = e."userId" AND dwell."postId" = e."postId"
            AND dwell."rankingSessionId" = e."rankingSessionId"
            AND dwell.kind = 'dwell' AND dwell."durationMs" >= 8000
            AND dwell."createdAt" >= e."occurredAt"
            AND dwell."createdAt" < e."occurredAt" + INTERVAL '7 days') AS "longDwell",
        EXISTS (SELECT 1 FROM "FeedUserPostFeedback" n
          WHERE n."userId" = e."userId" AND n."postId" = e."postId"
            AND n."kind" = 'not_interested'
            AND n."createdAt" >= e."occurredAt"
            AND n."createdAt" < e."occurredAt" + INTERVAL '7 days') AS negative
      FROM exposures e
    ), per_user AS (
      SELECT "userId", "experimentVariant",
             BOOL_OR(meaningful) AS engaged, BOOL_OR(negative) AS negative,
             BOOL_OR(opened) AS opened, BOOL_OR("longDwell") AS "longDwell"
      FROM outcomes GROUP BY "userId", "experimentVariant"
    ), arm_counts AS (
      SELECT "experimentVariant", COUNT(*)::integer AS users,
             COUNT(*) FILTER (WHERE engaged)::integer AS "engagedUsers",
             COUNT(*) FILTER (WHERE negative)::integer AS "negativeUsers",
             COUNT(*) FILTER (WHERE opened)::integer AS "postOpenedUsers",
             COUNT(*) FILTER (WHERE "longDwell")::integer AS "longDwellUsers"
      FROM per_user GROUP BY "experimentVariant"
    ), content_counts AS (
      SELECT "experimentVariant",
             COUNT(DISTINCT "postId")::integer AS "postsExposed",
             COUNT(DISTINCT "authorId")::integer AS "authorsExposed"
      FROM outcomes GROUP BY "experimentVariant"
    )
    SELECT a."experimentVariant" AS variant, a.users, a."engagedUsers",
           a."negativeUsers", a."postOpenedUsers", a."longDwellUsers",
           c."postsExposed", c."authorsExposed"
    FROM arm_counts a JOIN content_counts c USING ("experimentVariant")
    ORDER BY a."experimentVariant"
  `);
  const arms = result.map(row => ({
    ...row, postOpenedUsers: row.postOpenedUsers ?? 0, longDwellUsers: row.longDwellUsers ?? 0,
    engagementRate: rate(row.engagedUsers, row.users),
    negativeRate: rate(row.negativeUsers, row.users),
    postOpenRate: rate(row.postOpenedUsers ?? 0, row.users),
    longDwellRate: rate(row.longDwellUsers ?? 0, row.users),
  }));
  const control = arms.find(arm => arm.variant === "control");
  const treatment = arms.find(arm => arm.variant === "treatment");
  let comparison: SmartExperimentReport["comparison"] = null;
  if (control && treatment) {
    const [cl, cu] = wilson95(control.engagedUsers, control.users);
    const [tl, tu] = wilson95(treatment.engagedUsers, treatment.users);
    const absoluteDifference = treatment.engagementRate - control.engagementRate;
    comparison = {
      absoluteDifference,
      relativeLift: control.engagementRate ? absoluteDifference / control.engagementRate : null,
      confidenceInterval95: [tl - cu, tu - cl],
      // Exposure-only diagnostic threshold. A real decision requires
      // precomputed power, full guardrails and product review.
      eligibleForDecision: false,
    };
  }
  return {
    from: from.toISOString(), toExclusive: to.toISOString(), windowDays,
    eventWindowDays: 7, arms, comparison,
  };
}
