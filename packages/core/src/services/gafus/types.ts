
import type { GafusLedgerMetadata } from "@gafus/types";

/** Temporary transaction view for legacy Gafus reward policy.
 * This is a minimal structural transaction surface. Never construct one in Core. */
/** Database-neutral transaction capability for the remaining atomic Gafus
 * policies. These are the precise delegates consumed by Core: no PrismaClient,
 * no way to open or nest a transaction, and no raw database dependency.
 * Persistence owns the concrete transaction, locks and SQL implementation. */
type TxRead = { where: Record<string, unknown>; select?: Record<string, unknown>; include?: Record<string, unknown>; orderBy?: unknown };
type TxWrite = { where?: Record<string, unknown>; data?: Record<string, unknown>; create?: Record<string, unknown>; update?: Record<string, unknown> };
type TxRow<T> = PromiseLike<T>;
export interface GafusTx {
  $queryRaw(strings: TemplateStringsArray, ...args: unknown[]): TxRow<unknown>;
  gafusWallet: {
    findUnique(args: TxRead): TxRow<{ balance: number } | null>;
  };
  gafusRewardEvent: {
    findUnique(args: TxRead): TxRow<{ userId: string; rewardKind: GafusRewardKind; sourceEntityId: string; decision: GafusDecision; amount: number; transactionId: string | null } | null>;
    findFirst(args: TxRead): TxRow<{ id: string } | null>;
    create(args: TxWrite): TxRow<unknown>;
    aggregate(args: { _sum: { amount: true }; where: Record<string, unknown> }): TxRow<{ _sum: { amount: number | null } }>;
  };
  gafusNotificationOutbox: { upsert(args: TxWrite): TxRow<unknown> };
  gafusSettings: { findUnique(args: TxRead): TxRow<GafusSettingsConfig | null> };
  gafusPostReactionProgram: {
    create(args: TxWrite): TxRow<unknown>;
    findUnique(args: TxRead): TxRow<{ thresholdStep: number; highWaterReactionCount: number; settingsRevision: number } | null>;
    update(args: TxWrite): TxRow<unknown>;
  };
  feedPostReaction: { count(args: TxRead): TxRow<number> };
  gafusFraudSignal: { findFirst(args: TxRead): TxRow<{ id: string } | null>; create(args: TxWrite): TxRow<unknown> };
  gafusPostReactionMilestone: { create(args: TxWrite): TxRow<unknown> };
  dayOnCourse: { findUnique(args: TxRead): TxRow<{ courseId: string; dayId: string; course: { isPaid: boolean; isPrivate: boolean } } | null> };
  stepOnDay: { findUnique(args: TxRead): TxRow<{ dayId: string; step: { type: string; isDailyCourse: boolean; videoUrl: string | null } } | null> };
  course: { findFirst(args: TxRead): TxRow<{ id: string; isPaid: boolean; isPrivate: boolean } | null> };
  article: { findUnique(args: TxRead): TxRow<{ id: string } | null> };
  user: { findUnique(args: TxRead): TxRow<{ role: string } | null> };
  appSubscription: { findFirst(args: TxRead): TxRow<{ id: string } | null> };
  courseAccess: { findFirst(args: TxRead): TxRow<{ courseId: string } | null> };
  gafusTargetAccess: { findFirst(args: TxRead): TxRow<{ expiresAt: Date } | null> };
  trainerVideo: { findUnique(args: TxRead): TxRow<{ id: string; relativePath: string } | null> };
  dailyCourseSchedule: { findFirst(args: TxRead): TxRow<{ bundleId: string } | null> };
  dailyCourseBundleStep: { findUnique(args: TxRead): TxRow<{ bundleId: string; step: { videoUrl: string | null } } | null> };
}


export type GafusRewardKind =
  | "POST_PUBLISHED"
  | "QUESTION_CREATED"
  | "ANSWER_CREATED"
  | "POST_REACTION_MILESTONE"
  | "BEST_ANSWER";

export type GafusActivityKind =
  | "POST_PUBLISHED"
  | "QUESTION_CREATED"
  | "ANSWER_CREATED";

export type GafusDecision =
  | "GRANTED"
  | "DENIED_ACTIVITY_LIMIT"
  | "DENIED_ANTI_ABUSE"
  | "DENIED_POLICY"
  | "DISABLED";

export type GafusRewardInput = {
  userId: string;
  kind: GafusRewardKind;
  eventKey: string;
  sourceEntityId: string;
  occurredAt: Date;
  title?: string;
  body?: string;
  content?: string;
  hasPublishedMedia?: boolean;
  metadata?: GafusLedgerMetadata;
};

export type GafusRewardResult = {
  decision: GafusDecision;
  amount: number;
  transactionId: string | null;
  balance: number;
  replay: boolean;
};

export type GafusSettingsConfig = {
  revision: number;
  economyEnabled: boolean;
  earningEnabled: boolean;
  spendingEnabled: boolean;
  postReward: number;
  questionReward: number;
  answerReward: number;
  activityLimit: number;
  activityWindowSeconds: number;
  reactionThreshold: number;
  reactionReward: number;
  bestAnswerReward: number;
  courseStepCost: number;
  miniGuideCost: number;
  accessDurationSeconds: number;
};
