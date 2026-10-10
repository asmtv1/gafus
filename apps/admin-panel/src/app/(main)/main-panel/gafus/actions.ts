"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  adjustGafusBalanceAdmin,
  updateGafusSettingsAdmin,
  reviewGafusFraudSignalAdmin,
} from "@gafus/core/services/adminGafus";
import { importLegacyRewardedBatch } from "@gafus/core/services/gafus";

const route = "/main-panel/gafus";

async function adminId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return session.user.id;
}

function requiredText(form: FormData, key: string): string {
  const value = String(form.get(key) ?? "").trim();
  if (!value) throw new Error("MISSING_FIELD");
  return value;
}

function intValue(form: FormData, key: string): number {
  const str = requiredText(form, key);
  const value = Number(str);
  if (!Number.isSafeInteger(value)) throw new Error("INVALID_NUMBER");
  return value;
}

function errorUrl(code: string) {
  return `${route}?error=${encodeURIComponent(code.slice(0, 60))}`;
}

export async function saveGafusSettings(form: FormData) {
  let errorCode: string | null = null;
  try {
    const actorId = await adminId();
    const patch = {
      economyEnabled: form.get("economyEnabled") === "on",
      earningEnabled: form.get("earningEnabled") === "on",
      spendingEnabled: form.get("spendingEnabled") === "on",
      postReward: intValue(form, "postReward"),
      questionReward: intValue(form, "questionReward"),
      answerReward: intValue(form, "answerReward"),
      activityLimit: intValue(form, "activityLimit"),
      activityWindowSeconds: intValue(form, "activityWindowSeconds"),
      reactionThreshold: intValue(form, "reactionThreshold"),
      reactionReward: intValue(form, "reactionReward"),
      bestAnswerReward: intValue(form, "bestAnswerReward"),
      courseStepCost: intValue(form, "courseStepCost"),
      miniGuideCost: intValue(form, "miniGuideCost"),
      accessDurationSeconds: intValue(form, "accessDurationSeconds"),
    };
    await updateGafusSettingsAdmin({
      actorId,
      expectedRevision: intValue(form, "revision"),
      patch,
      reason: requiredText(form, "reason"),
    });
    revalidatePath(route);
  } catch (error) {
    errorCode = error instanceof Error ? error.message : "ERROR";
  }
  redirect(errorCode ? errorUrl(errorCode) : `${route}?updated=1`);
}

export async function adjustGafusWallet(form: FormData) {
  let errorCode: string | null = null;
  try {
    const actorId = await adminId();
    await adjustGafusBalanceAdmin({
      actorId,
      userId: requiredText(form, "userId"),
      delta: intValue(form, "delta"),
      requestId: requiredText(form, "requestId"),
      reason: requiredText(form, "reason"),
    });
    revalidatePath(route);
  } catch (error) {
    errorCode = error instanceof Error ? error.message : "ERROR";
  }
  redirect(errorCode ? errorUrl(errorCode) : `${route}?adjusted=1`);
}
export async function reviewGafusFraudSignal(form: FormData) {
  let errorCode: string | null = null;
  try {
    const actorId = await adminId();
    const decision = requiredText(form, "decision");
    if (decision !== "CONFIRM" && decision !== "DISMISS") throw new Error("INVALID_ACTION");
    await reviewGafusFraudSignalAdmin({
      actorId, signalId: requiredText(form, "signalId"),
      action: decision,
      requestedReversal: decision === "CONFIRM" ? intValue(form, "requestedReversal") : 0,
      reason: requiredText(form, "reason"),
    });
    revalidatePath(route);
  } catch (error) {
    errorCode = error instanceof Error ? error.message : "ERROR";
  }
  redirect(errorCode ? errorUrl(errorCode) : `${route}?reviewed=1`);
}
/** Explicitly operator-triggered, gated twice, never from a page-load effect. */
export async function importLegacyGafusCredits(form: FormData) {
  let errorCode: string | null = null;
  let nextCursor: string | null = null;
  let imported = 0;
  let credits = 0;
  try {
    const actorId = await adminId();
    if (form.get("confirmation") !== "IMPORT_LEGACY_GAFUS") {
      throw new Error("LEGACY_IMPORT_CONFIRMATION_REQUIRED");
    }
    const cursor = String(form.get("cursor") ?? "").trim();
    if (cursor.length > 128) throw new Error("INVALID_CURSOR");
    const result = await importLegacyRewardedBatch({
      actorId, confirmed: true, batchSize: 50, cursor: cursor || undefined,
    });
    nextCursor = result.nextCursor;
    imported = result.imported;
    credits = result.credits;
    revalidatePath(route);
  } catch (error) {
    errorCode = error instanceof Error ? error.message : "ERROR";
  }
  if (errorCode) redirect(errorUrl(errorCode));
  const next = nextCursor ? `&nextCursor=${encodeURIComponent(nextCursor)}` : "";
  redirect(`${route}?imported=${imported}&importedCredits=${credits}${next}`);
}
