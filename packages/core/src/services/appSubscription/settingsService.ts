import { prisma } from "@gafus/prisma";

import {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  getMobileFeatureFlagEnabled,
  type ClientAppContext,
} from "../appFeatureFlags";
import { ensureAppleAppAccountToken } from "./appleAccountTokenService";
import { getAppSubscriptionPlanConfig, getEnabledAppSubscriptionPlanConfigs } from "./plans";
import { getAppSubscriptionPromoCodeOfferState } from "./promoCodeService";
import type { AppSubscriptionOfferDto } from "./types";

const SETTINGS_KEY = "default";

type AppleTokenReader = (userId: string) => Promise<string | null>;

async function buildAppSubscriptionOffer(
  userId: string,
  clientContext: ClientAppContext,
  readAppleToken: AppleTokenReader,
): Promise<AppSubscriptionOfferDto> {
  const settings = await prisma.appSubscriptionSettings.findUnique({
    where: { key: SETTINGS_KEY },
    select: {
      weeklyEnabled: true,
      twoWeeksEnabled: true,
      monthlyEnabled: true,
      threeMonthsEnabled: true,
      yookassaWeeklyPriceRub: true,
      yookassaTwoWeeksPriceRub: true,
      yookassaMonthlyPriceRub: true,
      yookassaThreeMonthsPriceRub: true,
      currency: true,
      weeklyIntervalDays: true,
      twoWeeksIntervalDays: true,
      monthlyIntervalDays: true,
      threeMonthsIntervalDays: true,
      weeklyAppleProductId: true,
      monthlyAppleProductId: true,
    },
  });

  const [appAccountToken, iosRuCardPaymentEnabled, promoCode, user] = await Promise.all([
    readAppleToken(userId),
    getMobileFeatureFlagEnabled(
      APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
      clientContext,
      false,
      false,
    ),
    getAppSubscriptionPromoCodeOfferState({ userId, clientContext }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { savedRegistrationPromoCode: { select: {
        code: true, isActive: true, archivedAt: true,
      } } },
    }),
  ]);

  const monthlyPlan = getAppSubscriptionPlanConfig(settings, "MONTHLY");
  const yookassaPlans = getEnabledAppSubscriptionPlanConfigs(settings);
  const applePlan = monthlyPlan.appleProductId
    ? { ...monthlyPlan, label: "Месяц", title: "Месячный" }
    : null;

  return {
    // Older mobile clients only understand the monthly YooKassa offer. Keep it until
    // every supported version consumes `yookassaPlans`.
    plans: monthlyPlan.enabled ? [monthlyPlan] : [],
    yookassaPlans,
    // Apple availability is deliberately independent from the YooKassa monthly switch.
    applePlan,
    appleAppAccountToken: appAccountToken,
    iosRuCardPaymentEnabled,
    promoCode,
    savedRegistrationPromoCode: user?.savedRegistrationPromoCode
      ? {
          code: user.savedRegistrationPromoCode.code,
          status: user.savedRegistrationPromoCode.archivedAt
            ? "ARCHIVED"
            : user.savedRegistrationPromoCode.isActive
              ? "ACTIVE"
              : "INACTIVE",
        }
      : null,
  };
}

/** Legacy offer behavior: keep stable token creation until the native init contract is approved. */
export function getAppSubscriptionOffer(
  userId: string,
  clientContext: ClientAppContext = { platform: "unknown", version: null },
): Promise<AppSubscriptionOfferDto> {
  return buildAppSubscriptionOffer(userId, clientContext, ensureAppleAppAccountToken);
}

/** Read-only proposal for G1: no identity allocation. Not wired to live GET until
 * an explicit authenticated Apple-token initialization contract is approved. */
export function getAppSubscriptionOfferSnapshot(
  userId: string,
  clientContext: ClientAppContext = { platform: "unknown", version: null },
): Promise<AppSubscriptionOfferDto> {
  return buildAppSubscriptionOffer(userId, clientContext, async (ownerId) => {
    const user = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { appleAppAccountToken: true },
    });
    return user?.appleAppAccountToken ?? null;
  });
}
