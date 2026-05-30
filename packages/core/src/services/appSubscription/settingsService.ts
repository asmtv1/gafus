import { prisma } from "@gafus/prisma";

import {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  getAppFeatureFlagEnabled,
} from "../appFeatureFlags";
import { ensureAppleAppAccountToken } from "./appleAccountTokenService";
import { getYookassaTrialAvailability } from "./trialService";
import type { AppSubscriptionOfferDto } from "./types";

const SETTINGS_KEY = "default";

export async function getAppSubscriptionOffer(userId: string): Promise<AppSubscriptionOfferDto> {
  const settings = await prisma.appSubscriptionSettings.findUnique({
    where: { key: SETTINGS_KEY },
    select: {
      yookassaWeeklyPriceRub: true,
      currency: true,
      intervalDays: true,
      appleProductId: true,
    },
  });

  const appAccountToken = await ensureAppleAppAccountToken(userId);
  const yookassaTrial = await getYookassaTrialAvailability(userId);
  const iosRuCardPaymentEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
    false,
  );

  return {
    intervalDays: 7,
    currency: "RUB",
    yookassaPriceRub: Number(settings?.yookassaWeeklyPriceRub ?? 200),
    appleProductId: settings?.appleProductId ?? null,
    appleAppAccountToken: appAccountToken,
    iosRuCardPaymentEnabled,
    yookassaTrialAvailable: yookassaTrial.available,
    yookassaTrialDays: yookassaTrial.trialDays,
  };
}
