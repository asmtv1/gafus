export type WorkerAppSubscriptionPlanCode = "WEEKLY" | "MONTHLY";

type SettingsSource = {
  weeklyEnabled?: boolean | null;
  monthlyEnabled?: boolean | null;
  yookassaWeeklyPriceRub?: unknown;
  yookassaMonthlyPriceRub?: unknown;
  currency?: string | null;
  weeklyIntervalDays?: number | null;
  monthlyIntervalDays?: number | null;
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

function normalizePlanCode(value: unknown): WorkerAppSubscriptionPlanCode {
  return value === "MONTHLY" ? "MONTHLY" : "WEEKLY";
}

export function getWorkerAppSubscriptionPlan(
  settings: SettingsSource,
  rawPlanCode: unknown,
): WorkerAppSubscriptionPlan {
  const code = normalizePlanCode(rawPlanCode);
  if (code === "MONTHLY") {
    return {
      code,
      intervalDays: numberOrDefault(settings?.monthlyIntervalDays, 30),
      currency: "RUB",
      yookassaPriceRub: numberOrDefault(settings?.yookassaMonthlyPriceRub, 1100),
    };
  }

  return {
    code,
    intervalDays: numberOrDefault(settings?.weeklyIntervalDays ?? settings?.intervalDays, 7),
    currency: "RUB",
    yookassaPriceRub: numberOrDefault(settings?.yookassaWeeklyPriceRub, 200),
  };
}
