import { APP_SUBSCRIPTION_TIER_TITLES, APP_SUBSCRIPTION_TIER_BY_BILLING_CODE, appSubscriptionTierIncludesOfflineCourses, resolveAppSubscriptionBillingCode, resolveAppSubscriptionTier, type AppSubscriptionTier, type AppSubscriptionPlanCode as CanonicalAppSubscriptionPlanCode } from "@gafus/types";

/** `WEEKLY` is historical. `TWO_WEEKS` and `THREE_MONTHS` are stable billing codes,
 * not durations: current public offers all last 30 days. Keep these codes for
 * payment history, pending checkouts and subscription agreement snapshots. */
export const APP_SUBSCRIPTION_PLAN_CODES = [
  "WEEKLY",
  "TWO_WEEKS",
  "MONTHLY",
  "THREE_MONTHS",
] as const;
export const PUBLIC_APP_SUBSCRIPTION_PLAN_CODES = ["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"] as const;
export const PROMO_ELIGIBLE_APP_SUBSCRIPTION_PLAN_CODES = ["MONTHLY", "THREE_MONTHS"] as const;

export type AppSubscriptionPlanCode = CanonicalAppSubscriptionPlanCode;
// Compile-time, bidirectional: neither the historical WEEKLY nor any billing code can drift.
type AssertPlanCodes<T extends true> = T;
type _RuntimeToShared = AssertPlanCodes<
  (typeof APP_SUBSCRIPTION_PLAN_CODES)[number] extends CanonicalAppSubscriptionPlanCode
    ? true
    : false
>;
type _SharedToRuntime = AssertPlanCodes<
  CanonicalAppSubscriptionPlanCode extends (typeof APP_SUBSCRIPTION_PLAN_CODES)[number]
    ? true
    : false
>;

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
  planTier: AppSubscriptionTier;
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
  LEGACY_WEEKLY: {
    label: "Неделя",
    title: "Недельный",
    fallbackPriceRub: 200,
    fallbackIntervalDays: 7,
  },
  STANDARD: {
    label: APP_SUBSCRIPTION_TIER_TITLES.STANDARD,
    title: APP_SUBSCRIPTION_TIER_TITLES.STANDARD,
    fallbackPriceRub: 1465,
    fallbackIntervalDays: 30,
  },
  BASIC: {
    label: APP_SUBSCRIPTION_TIER_TITLES.BASIC,
    title: APP_SUBSCRIPTION_TIER_TITLES.BASIC,
    fallbackPriceRub: 1185,
    fallbackIntervalDays: 30,
  },
  PREMIUM: {
    label: APP_SUBSCRIPTION_TIER_TITLES.PREMIUM,
    title: APP_SUBSCRIPTION_TIER_TITLES.PREMIUM,
    fallbackPriceRub: 2470,
    fallbackIntervalDays: 30,
  },
} as const satisfies Record<
  AppSubscriptionTier,
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
  return resolveAppSubscriptionBillingCode(value);
}

/** Human-readable plan name for operator-facing surfaces and historical records. */
export function getAppSubscriptionPlanLabel(value: unknown): string {
  const tier = resolveAppSubscriptionTier(value);
  return tier ? PLAN_DEFINITIONS[tier].label : "Неизвестный тариф";
}

export function isPublicAppSubscriptionPlanCode(
  value: unknown,
): value is (typeof PUBLIC_APP_SUBSCRIPTION_PLAN_CODES)[number] {
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

function publicPlanPresentation(tier: AppSubscriptionTier) {
  switch (tier) {
    case "BASIC":
      return {
        offlineCourseDownloadIncluded: false,
        consultationBookingIncluded: false,
        cynologistChatIncluded: false,
        promoCodeEligible: false,
        badge: null,
      };
    case "STANDARD":
      return {
        offlineCourseDownloadIncluded: true,
        consultationBookingIncluded: false,
        cynologistChatIncluded: true,
        promoCodeEligible: true,
        badge: "POPULAR" as const,
      };
    case "PREMIUM":
      return {
        offlineCourseDownloadIncluded: true,
        consultationBookingIncluded: true,
        cynologistChatIncluded: true,
        promoCodeEligible: true,
        badge: null,
      };
    case "LEGACY_WEEKLY":
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
  return appSubscriptionTierIncludesOfflineCourses(value);
}

export function getAppSubscriptionPlanConfig(
  settings: AppSubscriptionSettingsPlanSource,
  code: AppSubscriptionPlanCode,
): AppSubscriptionPlanConfig {
  const tier = APP_SUBSCRIPTION_TIER_BY_BILLING_CODE[code];
  const definition = PLAN_DEFINITIONS[tier];
  const currency = settings?.currency === "RUB" ? "RUB" : "RUB";
  const presentation = publicPlanPresentation(tier);

  if (tier === "LEGACY_WEEKLY") {
    return {
      code,
      planTier: APP_SUBSCRIPTION_TIER_BY_BILLING_CODE[code],
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

  if (tier === "BASIC") {
    const yookassaPriceRub = numberOrDefault(
      settings?.yookassaTwoWeeksPriceRub,
      definition.fallbackPriceRub,
    );
    return {
      code,
      planTier: APP_SUBSCRIPTION_TIER_BY_BILLING_CODE[code],
      label: definition.title,
      title: definition.title,
      intervalDays: numberOrDefault(
        settings?.twoWeeksIntervalDays,
        definition.fallbackIntervalDays,
      ),
      currency,
      yookassaPriceRub,
      enabled: settings?.twoWeeksEnabled ?? false,
      appleProductId: null,
      ...presentation,
      savingsRub: null,
    };
  }

  if (tier === "PREMIUM") {
    const yookassaPriceRub = numberOrDefault(
      settings?.yookassaThreeMonthsPriceRub,
      definition.fallbackPriceRub,
    );
    return {
      code,
      planTier: APP_SUBSCRIPTION_TIER_BY_BILLING_CODE[code],
      label: definition.title,
      title: definition.title,
      intervalDays: numberOrDefault(
        settings?.threeMonthsIntervalDays,
        definition.fallbackIntervalDays,
      ),
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
    planTier: APP_SUBSCRIPTION_TIER_BY_BILLING_CODE[code],
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

/** Renewal terms are snapshotted when the subscription is signed. */
export function getStoredAppSubscriptionRenewalPlan(subscription: {
  planCode: unknown;
  renewalPriceRub?: unknown;
  renewalIntervalDays?: number | null;
  renewalCurrency?: string | null;
}): {
  code: AppSubscriptionPlanCode;
  intervalDays: number;
  currency: "RUB";
  yookassaPriceRub: number;
} | null {
  const code = normalizeAppSubscriptionPlanCode(subscription.planCode);
  const price = Number(subscription.renewalPriceRub);
  const days = subscription.renewalIntervalDays;
  if (
    !code ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !days ||
    !Number.isInteger(days) ||
    days <= 0 ||
    subscription.renewalCurrency !== "RUB"
  )
    return null;
  return { code, yookassaPriceRub: price, intervalDays: days, currency: "RUB" };
}
