import { requireGafusUnlockRowsPort, type GafusUnlockRowsPort } from "./gafusUnlockPort";
import { GafusError } from "./errors";
import { getGafusSettingsTx } from "./settingsService";
import type { GafusWalletService } from "./walletService";
import {
  resolveCourseStepTargetTx,
  resolveMiniGuideTargetTx,
  resolveArticleTargetTx, type TransactionalContentPolicy,
} from "../contentAccess";

export type GafusUnlockTarget =
  | { type: "COURSE_STEP"; dayOnCourseId: string; stepOnDayId: string }
  | { type: "MINI_GUIDE"; courseId: string }
  | { type: "ARTICLE"; articleId: string };

export type GafusUnlockResult = {
  spent: number;
  balance: number;
  accessSource: string;
  expiresAt: string | null;
  replay: boolean;
};

function validateUnlockInput(input: { userId: string; target: GafusUnlockTarget; clientRequestId: string }) {
  if (!input.userId.trim() || !input.clientRequestId.match(/^[a-zA-Z0-9_-]{8,128}$/)) {
    throw new GafusError("GAFUS_IDEMPOTENCY_CONFLICT", "Invalid Gafus unlock request");
  }
}

export async function unlockContentWithGafus(input: {
  userId: string;
  target: GafusUnlockTarget;
  clientRequestId: string;
  now?: Date;
}, walletService: Pick<GafusWalletService, "ensureGafusWalletTx" | "changeGafusBalanceTx">, policy: TransactionalContentPolicy, unlockRows?: GafusUnlockRowsPort): Promise<GafusUnlockResult> {
  validateUnlockInput(input);
  const rows = requireGafusUnlockRowsPort(unlockRows);
  const now = input.now ?? new Date();
  const idempotencyKey = `gafus:unlock:${input.userId}:${input.clientRequestId}`;

  return rows.withGafusUnlockTransaction(input.userId,async tx => {
    const requestedTarget = input.target.type === "COURSE_STEP"
      ? await resolveCourseStepTargetTx(tx, input.target.dayOnCourseId, input.target.stepOnDayId)
      : input.target.type === "MINI_GUIDE"
        ? await resolveMiniGuideTargetTx(tx, input.target.courseId)
        : await resolveArticleTargetTx(tx, input.target.articleId);
    // One purchase covers an entire mini-guide even when triggered from a step.
    const target = requestedTarget?.type === "COURSE_STEP"
      ? (await resolveMiniGuideTargetTx(tx, requestedTarget.courseId)) ?? requestedTarget
      : requestedTarget;
    if (!target) {
      throw new GafusError("GAFUS_TARGET_NOT_ELIGIBLE", "Content not found");
    }
    const prior = await rows.readGafusUnlockReplayTx(tx,idempotencyKey);
    if (prior) {
      if (prior.userId !== input.userId || prior.kind !== "SPEND"
        || prior.targetType !== target.type || prior.targetKey !== target.targetKey) {
        throw new GafusError("GAFUS_IDEMPOTENCY_CONFLICT", "Request ID used for a different unlock");
      }
      return {
        // Replay cannot renew or recreate an expired entitlement.
        spent: -prior.delta,
        balance: prior.balanceAfter,
        accessSource: "GAFUS",
        expiresAt: prior.targetAccess?.expiresAt.toISOString() ?? null,
        replay: true,
      };
    }

    const entitlement = target.type === "COURSE_STEP"
      ? await policy.resolveCourseStepAccessTx(tx, input.userId, target, now)
      : target.type === "MINI_GUIDE"
        ? await policy.resolveMiniGuideAccessTx(tx, input.userId, target, now)
        : await policy.resolveArticleAccessTx(tx, input.userId, target, now);
    const wallet = await walletService.ensureGafusWalletTx(tx, input.userId);
    if (entitlement.allowed) return {
      spent: 0, balance: wallet.balance, accessSource: entitlement.source,
      expiresAt: entitlement.expiresAt?.toISOString() ?? null, replay: true,
    };
    if (!entitlement.eligibleForGafus) {
      throw new GafusError("GAFUS_TARGET_NOT_ELIGIBLE", "Content cannot be unlocked with Gafus");
    }
    const settings = await getGafusSettingsTx(tx);
    if (!settings.economyEnabled || !settings.spendingEnabled) {
      throw new GafusError("GAFUS_DISABLED", "Gafus unlocks are currently disabled");
    }
    const cost = target.type === "COURSE_STEP" ? settings.courseStepCost
      : target.type === "MINI_GUIDE" ? settings.miniGuideCost : 1;
    if (wallet.balance < cost) {
      throw new GafusError("GAFUS_INSUFFICIENT_BALANCE", "Not enough Gafus");
    }
    const debit = await walletService.changeGafusBalanceTx(tx, {
      userId: input.userId, amount: -cost, kind: "SPEND", idempotencyKey,
      targetType: target.type, targetKey: target.targetKey,
      settingsRevision: settings.revision,
    });
    const expiresAt = new Date(now.getTime() + settings.accessDurationSeconds * 1000);
    await rows.insertGafusUnlockGrantTx(tx,{
      userId: input.userId,
      targetType: target.type,
      targetKey: target.targetKey,
      courseId: target.type === "ARTICLE" ? null : target.courseId,
      dayOnCourseId: target.type === "COURSE_STEP" ? target.dayOnCourseId : null,
      stepOnDayId: target.type === "COURSE_STEP" ? target.stepOnDayId : null,
      transactionId: debit.transactionId,
      settingsRevision: settings.revision,
      grantedAt: now,
      expiresAt,
    });
    return {
      spent: cost, balance: debit.balance, accessSource: "GAFUS",
      expiresAt: expiresAt.toISOString(), replay: false,
    };
  });
}

export async function unlockCourseStepWithGafus(input: {
  userId: string; dayOnCourseId: string; stepOnDayId: string;
  clientRequestId: string; now?: Date;
}, walletService: Pick<GafusWalletService, "ensureGafusWalletTx" | "changeGafusBalanceTx">, policy: TransactionalContentPolicy, unlockRows?: GafusUnlockRowsPort) {
  return unlockContentWithGafus({
    userId: input.userId, clientRequestId: input.clientRequestId,
    target: { type: "COURSE_STEP", dayOnCourseId: input.dayOnCourseId, stepOnDayId: input.stepOnDayId },
    now: input.now,
  }, walletService, policy, unlockRows);
}

export async function unlockArticleWithGafus(input: {
  userId: string; articleId: string; clientRequestId: string; now?: Date;
}, walletService: Pick<GafusWalletService, "ensureGafusWalletTx" | "changeGafusBalanceTx">, policy: TransactionalContentPolicy, unlockRows?: GafusUnlockRowsPort) {
  return unlockContentWithGafus({
    userId: input.userId, clientRequestId: input.clientRequestId,
    target: { type: "ARTICLE", articleId: input.articleId },
    now: input.now,
  }, walletService, policy, unlockRows);
}

export async function unlockMiniGuideWithGafus(input: {
  userId: string; courseId: string; clientRequestId: string; now?: Date;
}, walletService: Pick<GafusWalletService, "ensureGafusWalletTx" | "changeGafusBalanceTx">, policy: TransactionalContentPolicy, unlockRows?: GafusUnlockRowsPort) {
  return unlockContentWithGafus({
    userId: input.userId, clientRequestId: input.clientRequestId,
    target: { type: "MINI_GUIDE", courseId: input.courseId },
    now: input.now,
  }, walletService, policy, unlockRows);
}
