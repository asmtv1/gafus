import type { Prisma } from "@gafus/prisma";

export type GafusTx = Prisma.TransactionClient;

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
  metadata?: Prisma.InputJsonValue;
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
