/** Shared Gafus DTOs. Values and prices are server authoritative. */
export type GafusStatusDto = {
  serverNow: string;
  wallet: { balance: number };
  activity: {
    earned: number;
    limit: number;
    windowSeconds: number;
    remaining: number;
    nextCapacityAt: string | null;
  };
  rules: {
    postReward: number;
    questionReward: number;
    answerReward: number;
    reactionThreshold: number;
    reactionReward: number;
    bestAnswerReward: number;
    courseStepCost: number;
    miniGuideCost: number;
    accessDurationSeconds: number;
  };
  enabled: { economy: boolean; earning: boolean; spending: boolean };
  settingsRevision: number;
};

export type GafusHistoryEntry = {
  id: string;
  kind: "EARN" | "SPEND" | "ADMIN_CREDIT" | "ADMIN_DEBIT" | "LEGACY_IMPORT";
  delta: number;
  balanceAfter: number;
  createdAt: string;
  rewardKind: "POST_PUBLISHED" | "QUESTION_CREATED" | "ANSWER_CREATED"
    | "POST_REACTION_MILESTONE" | "BEST_ANSWER" | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  targetKey: string | null;
};
export type GafusHistoryPage = { items: GafusHistoryEntry[]; nextCursor: string | null };
export type GafusTarget =
  | { type: "COURSE_STEP"; dayOnCourseId: string; stepOnDayId: string }
  | { type: "MINI_GUIDE"; courseId: string };
export type GafusUnlockRequest = { target: GafusTarget; clientRequestId: string };
export type GafusUnlockResult = {
  spent: number; balance: number; accessSource: string;
  expiresAt: string | null; replay: boolean;
};
export type GafusMiniGuideDto = {
  courseId: string;
  title: string;
  description: string;
  imageUrl: string;
  unlocked: boolean;
  accessSource: string;
  expiresAt: string | null;
  canPurchase: boolean;
  price: number;
};
export type GafusReactionProgressDto = {
  postId: string;
  current: number;
  highWater: number;
  nextThreshold: number;
  thresholdStep: number;
  progress: number;
};
