/**
 * Pure Core feature-flag contract. One configuration for all mobile users.
 * Composition root binds the persistence adapter before serving requests.
 */
export {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES,
  APP_FEATURE_MOBILE_REWARDED_ADS_IOS,
  APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
} from "@gafus/types";

export type ClientAppContext = {
  platform: "ios" | "android" | "unknown";
  version: string | null;
  /** Internal server attestation: only an authenticated, running signed iOS YooKassa OTA. Never client-supplied. */
  verifiedIosYookassaPromo?: boolean;
};
export type MobileReleaseControlDto = {
  revision: number;
  ota: { required: boolean; version: string | null; platform: "all" | "ios" | "android" };
  global: { appSubscriptionPaywall: boolean; appSubscriptionGating: boolean };
  rewardedAds: {
    androidEnabled: boolean;
    dailyAdLimit: number;
    yandexAndroidPlacementId: string | null;
    yandexIosPlacementId: string | null;
    testMode: boolean;
  };
  updatedAt: string | null;
  updatedBy: { id: string; username: string } | null;
};
export type UpdateMobileReleaseControlInput = Omit<
  MobileReleaseControlDto, "updatedAt" | "updatedBy"
>;
export type MobileAppPublicConfig = {
  appSubscriptionPaywallEnabled: boolean;
  appSubscriptionGatingEnabled: boolean;
  resolvedClientVersion: string | null;
  ota: {
    required: boolean;
    version: string | null;
    platform: "all" | "ios" | "android";
    channel: "production";
  };
  minimumSupportedVersion: { ios: string; android: string };
  storeUrl: { ios: string; android: string };
};

export { MobileReleaseControlConflictError, RetiredRewardedAdsReadOnlyError } from "@gafus/types";

export function normalizeOtaControl(value: MobileReleaseControlDto["ota"]): MobileReleaseControlDto["ota"] {
  const version = value.version?.trim() || null;
  if (version !== null && !/^\d+\.\d+\.\d+-ota\.[1-9]\d*$/.test(version)) {
    throw new Error("Версия OTA должна иметь формат 1.7.3-ota.1");
  }
  if (value.required && version === null) {
    throw new Error("Нельзя требовать OTA без номера опубликованного обновления");
  }
  if (!["all", "ios", "android"].includes(value.platform)) {
    throw new Error("Недопустимая платформа OTA");
  }
  return { required: value.required, version, platform: value.platform };
}

export interface AppFeatureFlagsPorts {
  getAppFeatureFlagEnabled(key: string, defaultEnabled?: boolean): Promise<boolean>;
  getMobileFeatureFlagEnabled(key: string, context: ClientAppContext, defaultEnabled?: boolean): Promise<boolean>;
  getMobileReleaseControl(): Promise<MobileReleaseControlDto>;
  getMobileAppPublicConfig(context?: ClientAppContext): Promise<MobileAppPublicConfig>;
  setAppFeatureFlagEnabled(key: string, enabled: boolean): Promise<void>;
  updateMobileReleaseControl(input: UpdateMobileReleaseControlInput, actorId: string): Promise<MobileReleaseControlDto>;
}
