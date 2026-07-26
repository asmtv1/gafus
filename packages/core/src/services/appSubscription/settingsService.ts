import { prisma } from "@gafus/prisma";

import {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  getMobileFeatureFlagEnabled,
  type ClientAppContext,
} from "../appFeatureFlags";
import { ensureAppleAppAccountToken } from "./appleAccountTokenService";
import { getEnabledAppSubscriptionPlanConfigs } from "./plans";
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
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: true,
      yookassaMonthlyPriceRub: true,
      currency: true,
      weeklyIntervalDays: true,
      monthlyIntervalDays: true,
      weeklyAppleProductId: true,
      monthlyAppleProductId: true,
    },
  });

  const appAccountToken = await ensureAppleAppAccountToken(userId);
  const iosRuCardPaymentEnabled = await getMobileFeatureFlagEnabled(
    APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
    clientContext,
    false,
    false,
  );

  return {
    plans: getEnabledAppSubscriptionPlanConfigs(settings),
    appleAppAccountToken: appAccountToken,
    iosRuCardPaymentEnabled,
  };
}
