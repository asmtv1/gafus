/**
 * Pure Core feature-flag contract. One configuration for all mobile users.
 * Composition root binds the persistence adapter before serving requests.
 */
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT = "mobile_ios_ru_card_payment_hint";
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT = "mobile_ios_ru_card_payment";
export const APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES = "mobile_ios_subscription_promo_codes";
export const APP_FEATURE_MOBILE_REWARDED_ADS_IOS = "mobile_rewarded_ads_ios";
export const APP_FEATURE_APP_SUBSCRIPTION_PAYWALL = "app_subscription_paywall_enabled";
export const APP_FEATURE_APP_SUBSCRIPTION_GATING = "app_subscription_gating_enabled";

export type ClientAppContext = {
  platform: "ios" | "android" | "unknown";
  version: string | null;
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

let installedPort: Readonly<AppFeatureFlagsPorts> | null = null;
export function registerAppFeatureFlagsPort(port: AppFeatureFlagsPorts): void {
  if (installedPort !== null && installedPort !== port) {
    throw new Error("APP_FEATURE_FLAGS_PORT_ALREADY_BOUND");
  }
  installedPort = port;
}
function requirePort(): Readonly<AppFeatureFlagsPorts> {
  if (!installedPort) throw new Error("APP_FEATURE_FLAGS_PORT_UNBOUND");
  return installedPort;
}
export async function getAppFeatureFlagEnabled(key: string, defaultEnabled = false): Promise<boolean> {
  return requirePort().getAppFeatureFlagEnabled(key, defaultEnabled);
}
export async function getMobileFeatureFlagEnabled(
  key: string, context: ClientAppContext, defaultEnabled = false,
): Promise<boolean> {
  return requirePort().getMobileFeatureFlagEnabled(key, context, defaultEnabled);
}
export async function getMobileReleaseControl(): Promise<MobileReleaseControlDto> {
  return requirePort().getMobileReleaseControl();
}
export async function getMobileAppPublicConfig(
  context: ClientAppContext = { platform: "unknown", version: null },
): Promise<MobileAppPublicConfig> {
  return requirePort().getMobileAppPublicConfig(context);
}
export async function setAppFeatureFlagEnabled(key: string, enabled: boolean): Promise<void> {
  return requirePort().setAppFeatureFlagEnabled(key, enabled);
}
export async function updateMobileReleaseControl(
  input: UpdateMobileReleaseControlInput, actorId: string,
): Promise<MobileReleaseControlDto> {
  return requirePort().updateMobileReleaseControl(input, actorId);
}
