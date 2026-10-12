/** Adapter retains the original worker entry point; contract lives in core. */
import { getStoredAppSubscriptionRenewalPlan } from "@gafus/core/services/appSubscription/plans";
import type { AppSubscriptionPlanCode } from "@gafus/core/services/appSubscription/plans";

export type WorkerAppSubscriptionPlanCode = AppSubscriptionPlanCode;
export const getWorkerSubscriptionRenewalPlan = getStoredAppSubscriptionRenewalPlan;
