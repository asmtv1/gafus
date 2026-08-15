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

type SettingsSource = {
  weeklyEnabled?: boolean | null;
  twoWeeksEnabled?: boolean | null;
  monthlyEnabled?: boolean | null;
  threeMonthsEnabled?: boolean | null;
  yookassaWeeklyPriceRub?: unknown;
  yookassaTwoWeeksPriceRub?: unknown;
  yookassaMonthlyPriceRub?: unknown;
  yookassaThreeMonthsPriceRub?: unknown;
  currency?: string | null;
  weeklyIntervalDays?: number | null;
  twoWeeksIntervalDays?: number | null;
  monthlyIntervalDays?: number | null;
  threeMonthsIntervalDays?: number | null;
  intervalDays?: number | null;
} | null;

type WorkerAppSubscriptionPlan = {
  code: WorkerAppSubscriptionPlanCode;
  intervalDays: number;
  currency: "RUB";
  yookassaPriceRub: number;
};

function numberOrDefault(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePlanCode(value: unknown): WorkerAppSubscriptionPlanCode | null {
  return value === "WEEKLY" || value === "TWO_WEEKS" || value === "MONTHLY" || value === "THREE_MONTHS"
    ? value
    : null;
}

export function getWorkerAppSubscriptionPlan(
  settings: SettingsSource,
  rawPlanCode: unknown,
): WorkerAppSubscriptionPlan | null {
  const code = normalizePlanCode(rawPlanCode);
  if (!code) return null;

  if (code === "TWO_WEEKS") {
    return {
      code,
      intervalDays: numberOrDefault(settings?.twoWeeksIntervalDays, 14),
      currency: "RUB",
      yookassaPriceRub: numberOrDefault(settings?.yookassaTwoWeeksPriceRub, 1490),
    };
  }

  if (code === "MONTHLY") {
    return {
      code,
      intervalDays: numberOrDefault(settings?.monthlyIntervalDays, 30),
      currency: "RUB",
      yookassaPriceRub: numberOrDefault(settings?.yookassaMonthlyPriceRub, 2500),
    };
  }

  if (code === "THREE_MONTHS") {
    return {
      code,
      intervalDays: numberOrDefault(settings?.threeMonthsIntervalDays, 90),
      currency: "RUB",
      yookassaPriceRub: numberOrDefault(settings?.yookassaThreeMonthsPriceRub, 6490),
    };
  }

  return {
    code,
    intervalDays: numberOrDefault(settings?.weeklyIntervalDays ?? settings?.intervalDays, 7),
    currency: "RUB",
    yookassaPriceRub: numberOrDefault(settings?.yookassaWeeklyPriceRub, 200),
  };
}
