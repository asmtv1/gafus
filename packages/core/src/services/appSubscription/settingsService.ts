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

export async function getAppSubscriptionOffer(
  userId: string,
  clientContext: ClientAppContext = { platform: "unknown", version: null },
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

  const [appAccountToken, iosRuCardPaymentEnabled, promoCode] = await Promise.all([
    ensureAppleAppAccountToken(userId),
    getMobileFeatureFlagEnabled(
      APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
      clientContext,
      false,
      false,
    ),
    getAppSubscriptionPromoCodeOfferState({ userId, clientContext }),
  ]);

  const monthlyPlan = getAppSubscriptionPlanConfig(settings, "MONTHLY");
  const yookassaPlans = getEnabledAppSubscriptionPlanConfigs(settings);
  const applePlan = monthlyPlan.appleProductId ? monthlyPlan : null;

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
  };
}
