import {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  type getMobileFeatureFlagEnabled,
  type ClientAppContext,
} from "../appFeatureFlags";
import {
  getAppSubscriptionPlanConfig,
  getEnabledAppSubscriptionPlanConfigs,
  type AppSubscriptionSettingsPlanSource,
} from "./plans";
import type { getAppSubscriptionPromoCodeOfferState } from "./promoCodeService";
import type { AppSubscriptionOfferDto } from "./types";

export interface SubscriptionOfferPorts {
  readOfferSnapshot(ownerId: string): Promise<{
    settings: AppSubscriptionSettingsPlanSource;
    appleAppAccountToken: string | null;
    savedRegistrationPromoCode: { code: string; isActive: boolean; archivedAt: Date | null } | null;
  }>;
  readMobileFlag: typeof getMobileFeatureFlagEnabled;
  readPromoCodeState: typeof getAppSubscriptionPromoCodeOfferState;
}

export function createSubscriptionOfferReader(ports: SubscriptionOfferPorts) {
  return async function getAppSubscriptionOffer(
    userId: string,
    clientContext: ClientAppContext = { platform: "unknown", version: null },
  ): Promise<AppSubscriptionOfferDto> {
    const { settings, appleAppAccountToken, savedRegistrationPromoCode } =
      await ports.readOfferSnapshot(userId);

    const [iosRuCardPaymentEnabled, promoCode] = await Promise.all([
      ports.readMobileFlag(
        APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
        clientContext,
        false,
        false,
      ),
      ports.readPromoCodeState({ userId, clientContext }),
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
      appleAppAccountToken,
      iosRuCardPaymentEnabled,
      promoCode,
      savedRegistrationPromoCode: savedRegistrationPromoCode
        ? {
            code: savedRegistrationPromoCode.code,
            status: savedRegistrationPromoCode.archivedAt
              ? "ARCHIVED"
              : savedRegistrationPromoCode.isActive
                ? "ACTIVE"
                : "INACTIVE",
          }
        : null,
    };
  };
}
