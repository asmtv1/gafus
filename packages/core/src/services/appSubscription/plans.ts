/** `WEEKLY` is retained exclusively for historical subscriptions and Apple receipts. */
export const APP_SUBSCRIPTION_PLAN_CODES = [
  "WEEKLY",
  "TWO_WEEKS",
  "MONTHLY",
  "THREE_MONTHS",
] as const;
export const PUBLIC_APP_SUBSCRIPTION_PLAN_CODES = [
  "TWO_WEEKS",
  "MONTHLY",
  "THREE_MONTHS",
] as const;
export const PROMO_ELIGIBLE_APP_SUBSCRIPTION_PLAN_CODES = ["MONTHLY", "THREE_MONTHS"] as const;

export type AppSubscriptionPlanCode = (typeof APP_SUBSCRIPTION_PLAN_CODES)[number];

export type AppSubscriptionSettingsPlanSource = {
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
  offlineCourseDownloadIncluded: boolean;
  consultationBookingIncluded: boolean;
  cynologistChatIncluded: boolean;
  promoCodeEligible: boolean;
  badge: "TRY" | "POPULAR" | "MAX_SAVINGS" | null;
  savingsRub: number | null;
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
    title: "Поддержка в чате",
    fallbackPriceRub: 1465,
    fallbackIntervalDays: 30,
  },
  TWO_WEEKS: {
    label: "2 недели",
    title: "Самостоятельный",
    fallbackPriceRub: 1185,
    fallbackIntervalDays: 30,
  },
  THREE_MONTHS: {
    label: "3 месяца",
    title: "Полное сопровождение",
    fallbackPriceRub: 2470,
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
  return typeof value === "string" && APP_SUBSCRIPTION_PLAN_CODES.includes(value as AppSubscriptionPlanCode)
    ? (value as AppSubscriptionPlanCode)
    : null;
}

/** Human-readable plan name for operator-facing surfaces and historical records. */
export function getAppSubscriptionPlanLabel(value: unknown): string {
  const code = normalizeAppSubscriptionPlanCode(value);
  return code ? PLAN_DEFINITIONS[code].label : "Неизвестный тариф";
}

export function isPublicAppSubscriptionPlanCode(value: unknown): value is (typeof PUBLIC_APP_SUBSCRIPTION_PLAN_CODES)[number] {
  return (
    typeof value === "string" &&
    PUBLIC_APP_SUBSCRIPTION_PLAN_CODES.includes(
      value as (typeof PUBLIC_APP_SUBSCRIPTION_PLAN_CODES)[number],
    )
  );
}

export function isPromoEligibleAppSubscriptionPlanCode(
  value: unknown,
): value is (typeof PROMO_ELIGIBLE_APP_SUBSCRIPTION_PLAN_CODES)[number] {
  return (
    typeof value === "string" &&
    PROMO_ELIGIBLE_APP_SUBSCRIPTION_PLAN_CODES.includes(
      value as (typeof PROMO_ELIGIBLE_APP_SUBSCRIPTION_PLAN_CODES)[number],
    )
  );
}

function publicPlanPresentation(code: AppSubscriptionPlanCode) {
  switch (code) {
    case "TWO_WEEKS":
      return {
        offlineCourseDownloadIncluded: false,
        consultationBookingIncluded: false,
        cynologistChatIncluded: false,
        promoCodeEligible: false,
        badge: null,
      };
    case "MONTHLY":
      return {
        offlineCourseDownloadIncluded: true,
        consultationBookingIncluded: false,
        cynologistChatIncluded: true,
        promoCodeEligible: true,
        badge: "POPULAR" as const,
      };
    case "THREE_MONTHS":
      return {
        offlineCourseDownloadIncluded: true,
        consultationBookingIncluded: true,
        cynologistChatIncluded: true,
        promoCodeEligible: true,
        badge: null,
      };
    case "WEEKLY":
      return {
        offlineCourseDownloadIncluded: false,
        consultationBookingIncluded: false,
        cynologistChatIncluded: false,
        promoCodeEligible: false,
        badge: null,
      };
  }
}

export function isOfflineCourseDownloadIncludedPlanCode(value: unknown): boolean {
  const code = normalizeAppSubscriptionPlanCode(value);
  return code === "MONTHLY" || code === "THREE_MONTHS";
}

export function getAppSubscriptionPlanConfig(
  settings: AppSubscriptionSettingsPlanSource,
  code: AppSubscriptionPlanCode,
): AppSubscriptionPlanConfig {
  const definition = PLAN_DEFINITIONS[code];
  const currency = settings?.currency === "RUB" ? "RUB" : "RUB";
  const presentation = publicPlanPresentation(code);

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
      ...presentation,
      savingsRub: null,
    };
  }

  if (code === "TWO_WEEKS") {
    const yookassaPriceRub = numberOrDefault(
      settings?.yookassaTwoWeeksPriceRub,
      definition.fallbackPriceRub,
    );
    return {
      code,
      label: definition.title,
      title: definition.title,
      intervalDays: numberOrDefault(settings?.twoWeeksIntervalDays, definition.fallbackIntervalDays),
      currency,
      yookassaPriceRub,
      enabled: settings?.twoWeeksEnabled ?? false,
      appleProductId: null,
      ...presentation,
      savingsRub: null,
    };
  }

  if (code === "THREE_MONTHS") {
    const yookassaPriceRub = numberOrDefault(
      settings?.yookassaThreeMonthsPriceRub,
      definition.fallbackPriceRub,
    );
    return {
      code,
      label: definition.title,
      title: definition.title,
      intervalDays: numberOrDefault(settings?.threeMonthsIntervalDays, definition.fallbackIntervalDays),
      currency,
      yookassaPriceRub,
      enabled: settings?.threeMonthsEnabled ?? false,
      appleProductId: null,
      ...presentation,
      savingsRub: null,
    };
  }

  const yookassaPriceRub = numberOrDefault(
    settings?.yookassaMonthlyPriceRub,
    definition.fallbackPriceRub,
  );
  return {
    code,
    label: definition.title,
    title: definition.title,
    intervalDays: numberOrDefault(settings?.monthlyIntervalDays, definition.fallbackIntervalDays),
    currency,
    yookassaPriceRub,
    enabled: settings?.monthlyEnabled ?? true,
    appleProductId: nullableTrimmed(settings?.monthlyAppleProductId),
    ...presentation,
    savingsRub: null,
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
  return PUBLIC_APP_SUBSCRIPTION_PLAN_CODES.map((code) =>
    getAppSubscriptionPlanConfig(settings, code),
  ).filter((plan) => plan.enabled);
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
