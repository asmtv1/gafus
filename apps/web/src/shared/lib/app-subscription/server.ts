import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@gafus/auth";
import { getAppSubscriptionAccess, SubscriptionRequiredError } from "@gafus/core/services/appSubscription";
import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
  getAppFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";

export async function requireWebAppSubscription(userId: string) {
  const gatingEnabled = await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, false);
  if (!gatingEnabled) {
    return null;
  }

  const access = await getAppSubscriptionAccess(userId);
  if (!access.hasActiveSubscription) {
    redirect("/subscription?required=1");
  }

  return access;
}

export async function requireWebAppSubscriptionOrThrow(userId: string) {
  const gatingEnabled = await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, false);
  if (!gatingEnabled) {
    return;
  }

  const access = await getAppSubscriptionAccess(userId);
  if (!access.hasActiveSubscription) {
    throw new SubscriptionRequiredError();
  }
}

export async function requireSessionUserIdOrRedirectToLogin(): Promise<string> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  return userId;
}
