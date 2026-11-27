import { resolveAppSubscriptionTier } from "@gafus/types";

/** UI default only: entitlement and offer validation remain server-owned. */
export function selectDefaultSubscriptionPlan<T extends {
  code: string; planTier?: string | null; enabled?: boolean | null;
}>(plans: readonly T[] | null | undefined): T | null {
  const enabled = (plans ?? []).filter(plan => plan.enabled !== false);
  return enabled.find(plan => resolveAppSubscriptionTier(plan.planTier ?? plan.code) === "STANDARD")
    ?? enabled[0] ?? null;
}
