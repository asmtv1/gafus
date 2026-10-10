import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";
import {
  isSmartMlVector, smartMlPassesOfflineGate, trainSmartMl,
  type SmartMlTrainingRow,
} from "./smart-ml";

interface TrainingSqlRow {
  at: Date;
  features: unknown;
  reacted: boolean;
  commented: boolean;
  bookmarked: boolean;
  negative: boolean;
}

export interface SmartTrainingResult {
  status: "insufficient_data" | "failed_quality_gate" | "shadow_model_saved";
  samples: number;
  version?: string;
}

/** Runs only in an isolated worker task. Does not activate models or touch live feeds. */
export async function trainSmartFeedRanker(
  db: FeedDb, at = new Date(),
): Promise<SmartTrainingResult> {
  // All labels use real qualified exposures and a *mature* seven-day window.
  // SQL returns only numeric feature snapshots and binary labels, never user IDs.
  const rows = await db.$queryRaw<TrainingSqlRow[]>(Prisma.sql`
    SELECT i."occurredAt" AS "at", i."features" AS "features",
      EXISTS (
        SELECT 1 FROM "FeedPostReaction" r
        WHERE r."userId" = i."userId" AND r."postId" = i."postId"
          AND r."createdAt" >= i."occurredAt"
          AND r."createdAt" < i."occurredAt" + INTERVAL '7 days'
      ) AS "reacted",
      EXISTS (
        SELECT 1 FROM "FeedComment" c
        WHERE c."authorId" = i."userId" AND c."postId" = i."postId"
          AND c."deletedAt" IS NULL AND c."moderationState" = 'visible'
          AND c."createdAt" >= i."occurredAt"
          AND c."createdAt" < i."occurredAt" + INTERVAL '7 days'
      ) AS "commented",
      EXISTS (
        SELECT 1 FROM "FeedBookmark" b
        WHERE b."userId" = i."userId" AND b."postId" = i."postId"
          AND b."createdAt" >= i."occurredAt"
          AND b."createdAt" < i."occurredAt" + INTERVAL '7 days'
      ) AS "bookmarked",
      EXISTS (
        SELECT 1 FROM "FeedUserPostFeedback" n
        WHERE n."userId" = i."userId" AND n."postId" = i."postId"
          AND n."kind" = 'not_interested'
          AND n."createdAt" >= i."occurredAt"
          AND n."createdAt" < i."occurredAt" + INTERVAL '7 days'
      ) AS "negative"
    FROM "FeedImpression" i
    JOIN "FeedPost" p ON p."id" = i."postId"
    LEFT JOIN "FeedPersonalizationPreference" pref ON pref."userId" = i."userId"
    WHERE i."occurredAt" >= ${new Date(at.getTime() - 90 * 86_400_000)}
      AND i."occurredAt" <= ${new Date(at.getTime() - 8 * 86_400_000)}
      AND i."features" IS NOT NULL
      AND p."authorId" <> i."userId"
      AND COALESCE(pref."enabled", TRUE) = TRUE
      AND COALESCE(pref."useBehavior", TRUE) = TRUE
      AND (pref."historyResetAt" IS NULL OR i."occurredAt" >= pref."historyResetAt")
    ORDER BY i."occurredAt" DESC, i."id" DESC
    LIMIT 15000
  `);
  const training: SmartMlTrainingRow[] = rows.filter(row =>
    isSmartMlVector(row.features) && row.at instanceof Date,
  ).map(row => ({
    at: row.at,
    features: row.features as number[],
    labels: {
      reacted: row.reacted ? 1 : 0,
      commented: row.commented ? 1 : 0,
      bookmarked: row.bookmarked ? 1 : 0,
      negative: row.negative ? 1 : 0,
    },
  }));
  const version = "lr-v1-" + at.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const model = trainSmartMl(training, version, at);
  if (!model) return { status: "insufficient_data", samples: training.length };
  if (!smartMlPassesOfflineGate(model)) {
    return { status: "failed_quality_gate", samples: training.length };
  }
  await db.feedSmartRankerModel.create({
    data: {
      version, artifact: model as unknown as Prisma.InputJsonValue,
      active: false, trainedAt: at,
      trainRows: model.trainRows, validationRows: model.validationRows,
    },
  });
  return { status: "shadow_model_saved", samples: training.length, version };
}
