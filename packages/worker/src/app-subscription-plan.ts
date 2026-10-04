/**
 * `WEEKLY` remains supported exclusively for subscriptions created before the
 * 14/30/90-day offer. Never coerce an unknown value into this legacy plan: it
 * could charge an incorrect amount to a customer.
 */
export type WorkerAppSubscriptionPlanCode =
  | "WEEKLY"
  | "TWO_WEEKS"
  | "MONTHLY"
  | "THREE_MONTHS";

type WorkerAppSubscriptionPlan = {
  code: WorkerAppSubscriptionPlanCode;
  intervalDays: number;
  currency: "RUB";
  yookassaPriceRub: number;
};

function normalizePlanCode(value: unknown): WorkerAppSubscriptionPlanCode | null {
  return value === "WEEKLY" || value === "TWO_WEEKS" || value === "MONTHLY" || value === "THREE_MONTHS"
    ? value
    : null;
}

/** Charge only the agreement saved on the subscription, never today's catalogue. */
export function getWorkerSubscriptionRenewalPlan(subscription: {
  planCode: unknown;
  renewalPriceRub?: unknown;
  renewalIntervalDays?: number | null;
  renewalCurrency?: string | null;
}): WorkerAppSubscriptionPlan | null {
  const code = normalizePlanCode(subscription.planCode);
  const price = Number(subscription.renewalPriceRub);
  const days = subscription.renewalIntervalDays;
  if (!code || !Number.isFinite(price) || price <= 0 || !days || !Number.isInteger(days) || days <= 0 || subscription.renewalCurrency !== "RUB") return null;
  return { code, yookassaPriceRub: price, intervalDays: days, currency: "RUB" };
}
