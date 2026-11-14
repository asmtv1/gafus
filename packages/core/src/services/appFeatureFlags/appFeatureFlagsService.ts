/**
 * Pure Core contract for feature-flag policy reads. No SQL, no server package.
 * A process composition root must explicitly bind the persistence adapter
 * BEFORE serving requests. Missing binding throws (fail closed), never silently
 * falls back to `defaultEnabled` for paid-access or iOS payment gates.
 *
 * This process-level port is transitional compatibility for Core call sites.
 * New application use cases should prefer constructor-injected ports.
 */

export const APP_FEATURE_MOBILE_VK_LOGIN_IOS = "mobile_vk_login_ios";
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
export type MobileFeatureProfile = "RELEASED" | "REVIEW";
export type MobileVersionedFeatureValues = {
  vkLogin: boolean;
  iosRuCardPayment: boolean;
  subscriptionPromoCodes: boolean;
  iosRuCardPaymentHint: boolean;
  rewardedAds: boolean;
};
export type MobileReleaseControlDto = {
  revision: number;
  iosReviewVersion: string | null;
  ota: { required: boolean; version: string | null; platform: "all" | "ios" | "android" };
  released: MobileVersionedFeatureValues;
  review: MobileVersionedFeatureValues;
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
  vkLoginEnabledOnIos: boolean;
  appSubscriptionPaywallEnabled: boolean;
  appSubscriptionGatingEnabled: boolean;
  iosRuCardPaymentEnabled: boolean;
  iosRuCardPaymentHintEnabled: boolean;
  resolvedFeatureProfile: MobileFeatureProfile;
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

/** Errors share exact runtime constructors with the SQL adapter. */
export { MobileReleaseControlConflictError, RetiredRewardedAdsReadOnlyError } from "@gafus/types";

export function normalizeOtaControl(
  value: MobileReleaseControlDto["ota"],
): MobileReleaseControlDto["ota"] {
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
export function resolveMobileFeatureProfile(
  context: ClientAppContext,
  iosReviewVersion: string | null,
): MobileFeatureProfile {
  return context.platform === "ios" &&
    context.version !== null && /^\d+\.\d+\.\d+$/.test(context.version) &&
    iosReviewVersion !== null && context.version === iosReviewVersion
    ? "REVIEW" : "RELEASED";
}

/** Read/write are still performed by one authoritative Persistence package. */
export interface AppFeatureFlagsPorts {
  getAppFeatureFlagEnabled(key: string, defaultEnabled?: boolean): Promise<boolean>;
  getMobileFeatureFlagEnabled(
    key: string, context: ClientAppContext,
    defaultEnabled?: boolean, defaultReviewEnabled?: boolean,
  ): Promise<boolean>;
  getMobileReleaseControl(): Promise<MobileReleaseControlDto>;
  getMobileAppPublicConfig(context?: ClientAppContext): Promise<MobileAppPublicConfig>;
  setAppFeatureFlagEnabled(key: string, enabled: boolean): Promise<void>;
  updateMobileReleaseControl(
    input: UpdateMobileReleaseControlInput, actorId: string,
  ): Promise<MobileReleaseControlDto>;
}

let installedPort: Readonly<AppFeatureFlagsPorts> | null = null;

/** Called exactly once per service process, during startup composition.
 * Rebinding to another adapter is prohibited: otherwise concurrent requests
 * could silently switch feature profiles or authorization policies. */
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

export async function getAppFeatureFlagEnabled(
  key: string, defaultEnabled = false,
): Promise<boolean> {
  return requirePort().getAppFeatureFlagEnabled(key, defaultEnabled);
}
export async function getMobileFeatureFlagEnabled(
  key: string, context: ClientAppContext,
  defaultEnabled = false, defaultReviewEnabled = false,
): Promise<boolean> {
  return requirePort().getMobileFeatureFlagEnabled(
    key, context, defaultEnabled, defaultReviewEnabled,
  );
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
