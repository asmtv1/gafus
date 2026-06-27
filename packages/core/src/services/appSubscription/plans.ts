export const APP_SUBSCRIPTION_PLAN_CODES = ["WEEKLY", "MONTHLY"] as const;

export type AppSubscriptionPlanCode = (typeof APP_SUBSCRIPTION_PLAN_CODES)[number];

export type AppSubscriptionSettingsPlanSource = {
  weeklyEnabled?: boolean | null;
  monthlyEnabled?: boolean | null;
  yookassaWeeklyPriceRub?: unknown;
  yookassaMonthlyPriceRub?: unknown;
  currency?: string | null;
  weeklyIntervalDays?: number | null;
  monthlyIntervalDays?: number | null;
  weeklyAppleProductId?: string | null;
  monthlyAppleProductId?: string | null;
  intervalDays?: number | null;
  appleProductId?: string | null;
} | null;

export type AppSubscriptionPlanConfig = {
  code: AppSubscriptionPlanCode;
  label: string;
  title: string;
  intervalDays: number;
  currency: "RUB";
  yookassaPriceRub: number;
  enabled: boolean;
  appleProductId: string | null;
};

const PLAN_DEFINITIONS = {
  WEEKLY: {
    label: "Неделя",
    title: "Недельный",
    fallbackPriceRub: 200,
    fallbackIntervalDays: 7,
  },
  MONTHLY: {
    label: "Месяц",
    title: "Месячный",
    fallbackPriceRub: 1100,
    fallbackIntervalDays: 30,
  },
} as const satisfies Record<
  AppSubscriptionPlanCode,
  {
    label: string;
    title: string;
    fallbackPriceRub: number;
    fallbackIntervalDays: number;
  }
>;

function numberOrDefault(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nullableTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeAppSubscriptionPlanCode(value: unknown): AppSubscriptionPlanCode | null {
  return value === "WEEKLY" || value === "MONTHLY" ? value : null;
}

export function getAppSubscriptionPlanConfig(
  settings: AppSubscriptionSettingsPlanSource,
  code: AppSubscriptionPlanCode,
): AppSubscriptionPlanConfig {
  const definition = PLAN_DEFINITIONS[code];
  const currency = settings?.currency === "RUB" ? "RUB" : "RUB";

  if (code === "WEEKLY") {
    return {
      code,
      label: definition.label,
      title: definition.title,
      intervalDays: numberOrDefault(
        settings?.weeklyIntervalDays ?? settings?.intervalDays,
        definition.fallbackIntervalDays,
      ),
      currency,
      yookassaPriceRub: numberOrDefault(
        settings?.yookassaWeeklyPriceRub,
        definition.fallbackPriceRub,
      ),
      enabled: settings?.weeklyEnabled ?? true,
      appleProductId: nullableTrimmed(settings?.weeklyAppleProductId ?? settings?.appleProductId),
    };
  }

  return {
    code,
    label: definition.label,
    title: definition.title,
    intervalDays: numberOrDefault(settings?.monthlyIntervalDays, definition.fallbackIntervalDays),
    currency,
    yookassaPriceRub: numberOrDefault(
      settings?.yookassaMonthlyPriceRub,
      definition.fallbackPriceRub,
    ),
    enabled: settings?.monthlyEnabled ?? true,
    appleProductId: nullableTrimmed(settings?.monthlyAppleProductId),
  };
}

export function getAppSubscriptionPlanConfigs(
  settings: AppSubscriptionSettingsPlanSource,
): AppSubscriptionPlanConfig[] {
  return APP_SUBSCRIPTION_PLAN_CODES.map((code) => getAppSubscriptionPlanConfig(settings, code));
}

export function getEnabledAppSubscriptionPlanConfigs(
  settings: AppSubscriptionSettingsPlanSource,
): AppSubscriptionPlanConfig[] {
  return getAppSubscriptionPlanConfigs(settings).filter((plan) => plan.enabled);
}

export function findAppSubscriptionPlanConfig(
  settings: AppSubscriptionSettingsPlanSource,
  code: unknown,
): AppSubscriptionPlanConfig | null {
  const normalized = normalizeAppSubscriptionPlanCode(code);
  return normalized ? getAppSubscriptionPlanConfig(settings, normalized) : null;
}

export function findAppSubscriptionPlanByAppleProductId(
  settings: AppSubscriptionSettingsPlanSource,
  productId: string | null | undefined,
): AppSubscriptionPlanConfig | null {
  const normalizedProductId = nullableTrimmed(productId);
  if (!normalizedProductId) return null;
  return (
    getAppSubscriptionPlanConfigs(settings).find(
      (plan) => plan.appleProductId === normalizedProductId,
    ) ?? null
  );
}
