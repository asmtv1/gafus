import type { AppSubscriptionStatus } from "@gafus/prisma";
import {
  ensureGooglePlayAccountId,
  findGooglePlayReconciliationTokens,
  markGooglePlayReconciliationFailure,
  persistGooglePlayPurchase,
} from "@gafus/subscription-payment-server/google-play-rows";

import {
  acknowledgeGoogleSubscription,
  GooglePlayError,
  googlePlayConfigured,
  googlePlayPlans,
  readGoogleSubscription,
} from "./google-play-client.js";

export async function prepareGooglePlay(userId: string) {
  if (!googlePlayConfigured()) throw new GooglePlayError("UNAVAILABLE");
  const accountId = await ensureGooglePlayAccountId(userId);
  return { accountId, plans: googlePlayPlans() };
}

type Snapshot = NonNullable<Awaited<ReturnType<typeof readGoogleSubscription>>>;

export function classifyGoogleSubscription(purchase: Snapshot, now: Date, plans = googlePlayPlans()) {
  const validItems = purchase.lineItems.flatMap((item) => {
    const plan = plans.find((candidate) =>
      candidate.productId === item.productId && candidate.basePlanId === item.offerDetails?.basePlanId);
    return plan ? [{ item, plan, expires: item.expiryTime ? new Date(item.expiryTime) : null }] : [];
  });
  validItems.sort((a, b) => (b.expires?.getTime() ?? 0) - (a.expires?.getTime() ?? 0));
  const line = validItems[0];
  if (!line) throw new GooglePlayError("PLAN_INVALID");
  const state = purchase.subscriptionState;
  const pending = state === "SUBSCRIPTION_STATE_PENDING";
  const entitled = Boolean(line.expires && line.expires > now &&
    ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(state));
  let status: AppSubscriptionStatus = "EXPIRED";
  if (entitled) status = "ACTIVE";
  else if (pending) status = "PENDING";
  else if (state === "SUBSCRIPTION_STATE_ON_HOLD" || state === "SUBSCRIPTION_STATE_PAUSED") status = "PAST_DUE";
  else if (state === "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED") status = "CANCELED";

  return {
    data: {
      status,
      planCode: line.plan.planCode,
      currentPeriodStart: purchase.startTime ? new Date(purchase.startTime) : null,
      currentPeriodEnd: line.expires,
      cancelAtPeriodEnd: line.item.autoRenewingPlan?.autoRenewEnabled !== true,
      googlePlayCheckedAt: now,
    },
    pending,
    entitled,
    acknowledgeProduct: entitled && purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING"
      ? line.plan.productId : null,
  };
}

export async function syncGooglePlayPurchase(token: string, requestingUserId?: string) {
  if (!googlePlayConfigured()) throw new GooglePlayError("UNAVAILABLE");
  const result = await persistGooglePlayPurchase(token, requestingUserId, {
    readPurchase: readGoogleSubscription,
    classifyPurchase: classifyGoogleSubscription,
    makeError: (code) => new GooglePlayError(code),
  });

  // Persist the entitlement before acknowledging. Any callback or reconciliation
  // retries acknowledgement if the first request fails.
  if (result.acknowledgeProduct) {
    try {
      await acknowledgeGoogleSubscription(result.acknowledgeProduct, token);
    } catch (error) {
      const current = await readGoogleSubscription(token);
      if (current?.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") throw error;
    }
  }
  return { entitled: result.entitled, pending: result.pending };
}

export async function reconcileGooglePlayPurchases() {
  if (!googlePlayConfigured()) throw new GooglePlayError("UNAVAILABLE");
  const rows = await findGooglePlayReconciliationTokens();
  let failed = 0;
  for (const row of rows) {
    if (!row.googlePlayPurchaseToken) continue;
    try {
      await syncGooglePlayPurchase(row.googlePlayPurchaseToken);
    } catch {
      failed++;
      // Rotate failures through the batch so an unavailable token cannot starve others.
      await markGooglePlayReconciliationFailure(row.googlePlayPurchaseToken);
    }
  }
  return { checked: rows.length, failed };
}
