import { GafusError } from "./errors";
import { evaluateRewardEligibilityTx } from "./antiAbuseService";
import { lockGafusUser } from "./locking";
import { getGafusSettingsTx } from "./settingsService";
import { changeGafusBalanceTx } from "./walletService";
import type {
  GafusActivityKind, GafusDecision, GafusRewardInput,
  GafusRewardResult, GafusTx, GafusSettingsConfig,
} from "./types";

async function currentBalance(tx: GafusTx, userId: string): Promise<number> {
  const wallet = await tx.gafusWallet.findUnique({
    where: { userId }, select: { balance: true },
  });
  return wallet?.balance ?? 0;
}

async function findRewardReplayTx(
  tx: GafusTx, input: GafusRewardInput,
): Promise<GafusRewardResult | null> {
  const previous = await tx.gafusRewardEvent.findUnique({
    where: { eventKey: input.eventKey },
  });
  if (!previous) return null;
  if (previous.userId !== input.userId || previous.rewardKind !== input.kind
    || previous.sourceEntityId !== input.sourceEntityId) {
    throw new GafusError("GAFUS_IDEMPOTENCY_CONFLICT", "Reward event key belongs to another event");
  }
  return {
    decision: previous.decision,
    amount: previous.amount,
    transactionId: previous.transactionId,
    balance: await currentBalance(tx, input.userId),
    replay: true,
  };
}

async function denyTx(
  tx: GafusTx, input: GafusRewardInput, revision: number,
  decision: Exclude<GafusDecision, "GRANTED">,
  rewardClass: "ACTIVITY" | "BONUS",
  code?: string,
  fingerprint?: string | null,
): Promise<GafusRewardResult> {
  await tx.gafusRewardEvent.create({
    data: {
      userId: input.userId, eventKey: input.eventKey,
      rewardKind: input.kind, rewardClass, sourceEntityId: input.sourceEntityId,
      occurredAt: input.occurredAt, decision, amount: 0, settingsRevision: revision,
      denialCode: code, contentFingerprint: fingerprint ?? undefined,
      metadata: input.metadata,
    },
  });
  return {
    decision, amount: 0, transactionId: null,
    balance: await currentBalance(tx, input.userId), replay: false,
  };
}

async function grantTx(
  tx: GafusTx, input: GafusRewardInput, settings: GafusSettingsConfig,
  rewardClass: "ACTIVITY" | "BONUS", amount: number,
  fingerprint?: string | null,
): Promise<GafusRewardResult> {
  const mutation = await changeGafusBalanceTx(tx, {
    userId: input.userId, amount,
    idempotencyKey: `gafus:reward:${input.eventKey}`,
    kind: "EARN", rewardKind: input.kind,
    sourceEntityType: input.kind === "POST_PUBLISHED" || input.kind === "POST_REACTION_MILESTONE"
      ? "POST" : input.kind === "QUESTION_CREATED" ? "QUESTION" : "ANSWER",
    sourceEntityId: input.sourceEntityId,
    settingsRevision: settings.revision, metadata: input.metadata,
  });
  await tx.gafusRewardEvent.create({
    data: {
      userId: input.userId, eventKey: input.eventKey,
      rewardKind: input.kind, rewardClass, sourceEntityId: input.sourceEntityId,
      occurredAt: input.occurredAt, decision: "GRANTED", amount,
      settingsRevision: settings.revision, contentFingerprint: fingerprint ?? undefined,
      transactionId: mutation.transactionId, metadata: input.metadata,
    },
  });
  return {
    decision: "GRANTED", amount, transactionId: mutation.transactionId,
    balance: mutation.balance, replay: false,
  };
}

/**
 * The caller owns the enclosing content transaction. Never nest prisma.$transaction.
 * The wallet lock serializes rolling-window reads and writes for one user.
 */
export async function awardActivityTx(
  tx: GafusTx,
  input: GafusRewardInput & { kind: GafusActivityKind },
): Promise<GafusRewardResult> {
  await lockGafusUser(tx, input.userId);
  const replay = await findRewardReplayTx(tx, input);
  if (replay) return replay;

  const settings = await getGafusSettingsTx(tx);
  if (!settings.economyEnabled || !settings.earningEnabled) {
    return denyTx(tx, input, settings.revision, "DISABLED", "ACTIVITY");
  }
  const eligibility = await evaluateRewardEligibilityTx(tx, input);
  if (!eligibility.eligible) {
    return denyTx(tx, input, settings.revision, "DENIED_ANTI_ABUSE",
      "ACTIVITY", eligibility.code, eligibility.fingerprint);
  }
  const cutoff = new Date(input.occurredAt.getTime() - settings.activityWindowSeconds * 1000);
  const used = await tx.gafusRewardEvent.aggregate({
    _sum: { amount: true },
    where: {
      userId: input.userId, rewardClass: "ACTIVITY", decision: "GRANTED",
      occurredAt: { gt: cutoff, lte: input.occurredAt },
    },
  });
  const remaining = Math.max(0, settings.activityLimit - (used._sum.amount ?? 0));
  if (remaining <= 0) {
    return denyTx(tx, input, settings.revision, "DENIED_ACTIVITY_LIMIT",
      "ACTIVITY", "ROLLING_LIMIT", eligibility.fingerprint);
  }
  const configured = input.kind === "POST_PUBLISHED" ? settings.postReward
    : input.kind === "QUESTION_CREATED" ? settings.questionReward : settings.answerReward;
  const amount = Math.min(configured, remaining);
  if (amount <= 0) {
    return denyTx(tx, input, settings.revision, "DENIED_POLICY",
      "ACTIVITY", "ZERO_REWARD", eligibility.fingerprint);
  }
  return grantTx(tx, input, settings, "ACTIVITY", amount, eligibility.fingerprint);
}

export async function awardBonusTx(
  tx: GafusTx,
  input: GafusRewardInput & { kind: "POST_REACTION_MILESTONE" | "BEST_ANSWER" },
): Promise<GafusRewardResult> {
  await lockGafusUser(tx, input.userId);
  const replay = await findRewardReplayTx(tx, input);
  if (replay) return replay;
  const settings = await getGafusSettingsTx(tx);
  if (!settings.economyEnabled || !settings.earningEnabled) {
    return denyTx(tx, input, settings.revision, "DISABLED", "BONUS");
  }
  const amount = input.kind === "BEST_ANSWER" ? settings.bestAnswerReward : settings.reactionReward;
  if (amount <= 0) return denyTx(tx, input, settings.revision, "DENIED_POLICY", "BONUS", "ZERO_REWARD");
  const granted = await grantTx(tx, input, settings, "BONUS", amount);
  if (granted.decision === "GRANTED") {
    const isBestAnswer = input.kind === "BEST_ANSWER";
    const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata as { questionId?: string } : null;
    const url = isBestAnswer
      ? metadata?.questionId ? `/questions/${metadata.questionId}` : "/questions"
      : `/feed/${input.sourceEntityId}`;
    // Enqueue in the same transaction as the ledger entry; retries are handled
    // by the worker and never duplicate the reward transaction.
    await tx.gafusNotificationOutbox.upsert({
      where: { rewardEventId: input.eventKey },
      create: {
        rewardEventId: input.eventKey, userId: input.userId,
        kind: isBestAnswer ? "BEST_ANSWER" : "REACTION_MILESTONE",
        title: isBestAnswer ? "Ваш ответ выбрали лучшим!" : "Новая награда за реакции",
        body: `Вам начислено ${amount} Гафус${amount === 1 ? "" : "ов"}.`,
        url,
      },
      update: {},
    });
  }
  return granted;
}
