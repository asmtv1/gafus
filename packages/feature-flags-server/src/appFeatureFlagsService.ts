import { prisma } from "@gafus/prisma";
import { MobileReleaseControlConflictError, RetiredRewardedAdsReadOnlyError } from "@gafus/types";

/** Historical iOS external-checkout controls: permanently disabled. */
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT = "mobile_ios_ru_card_payment_hint";
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT = "mobile_ios_ru_card_payment";
export const APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES = "mobile_ios_subscription_promo_codes";
const RETIRED_IOS_PAYMENT_KEYS = new Set([
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
]);
export const APP_FEATURE_MOBILE_REWARDED_ADS_IOS = "mobile_rewarded_ads_ios";
export const APP_FEATURE_APP_SUBSCRIPTION_PAYWALL = "app_subscription_paywall_enabled";
export const APP_FEATURE_APP_SUBSCRIPTION_GATING = "app_subscription_gating_enabled";

const RELEASE_POLICY_KEY = "default";
const REWARDED_SETTINGS_KEY = "default";
const CURRENT_MOBILE_VERSION = "1.7.2";
const DEFAULT_IOS_STORE_URL = "https://apps.apple.com/ru/app/gafus/id6760964612";
const DEFAULT_ANDROID_STORE_URL = "https://www.rustore.ru/catalog/app/ru.gafus.app";
const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const OTA_VERSION_PATTERN = /^\d+\.\d+\.\d+-ota\.[1-9]\d*$/;

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

export type UpdateMobileReleaseControlInput = Omit<MobileReleaseControlDto, "updatedAt" | "updatedBy">;
export { MobileReleaseControlConflictError, RetiredRewardedAdsReadOnlyError } from "@gafus/types";

function getConfiguredVersion(value: string | undefined): string {
  const version = value?.trim();
  return version && SEMANTIC_VERSION_PATTERN.test(version) ? version : CURRENT_MOBILE_VERSION;
}

function getConfiguredStoreUrl(value: string | undefined, fallback: string): string {
  const url = value?.trim();
  return url?.startsWith("https://") ? url : fallback;
}

export function normalizeOtaControl(
  value: MobileReleaseControlDto["ota"],
): MobileReleaseControlDto["ota"] {
  const version = value.version?.trim() || null;
  if (version !== null && !OTA_VERSION_PATTERN.test(version)) {
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

function enabledFromRows(
  rows: { key: string; enabled: boolean }[],
  key: string,
  fallback: boolean,
): boolean {
  return rows.find((row) => row.key === key)?.enabled ?? fallback;
}

/** One identical flag value for every platform/version, never a review profile. */
export async function getAppFeatureFlagEnabled(key: string, defaultEnabled = false): Promise<boolean> {
  const row = await prisma.appFeatureFlag.findUnique({ where: { key }, select: { enabled: true } });
  return row?.enabled ?? defaultEnabled;
}

export async function setAppFeatureFlagEnabled(key: string, enabled: boolean): Promise<void> {
  await prisma.appFeatureFlag.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
}

export async function getMobileFeatureFlagEnabled(
  key: string, _context: ClientAppContext, defaultEnabled = false,
): Promise<boolean> {
  if (RETIRED_IOS_PAYMENT_KEYS.has(key)) return false;
  return getAppFeatureFlagEnabled(key, defaultEnabled);
}

export async function getMobileReleaseControl(): Promise<MobileReleaseControlDto> {
  const [policy, rows, rewarded] = await Promise.all([
    prisma.mobileAppReleasePolicy.findUnique({
      where: { key: RELEASE_POLICY_KEY },
      select: {
        otaRequired: true, otaVersion: true, otaPlatform: true,
        revision: true, updatedAt: true,
        updatedBy: { select: { id: true, username: true } },
      },
    }),
    prisma.appFeatureFlag.findMany({
      where: { key: { in: [APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, APP_FEATURE_APP_SUBSCRIPTION_GATING] } },
      select: { key: true, enabled: true },
    }),
    prisma.rewardedAdSettings.findUnique({ where: { key: REWARDED_SETTINGS_KEY } }),
  ]);
  return {
    revision: policy?.revision ?? 1,
    ota: {
      required: policy?.otaRequired ?? false,
      version: policy?.otaVersion ?? null,
      platform: policy?.otaPlatform === "ios" || policy?.otaPlatform === "android"
        ? policy.otaPlatform : "all",
    },
    global: {
      appSubscriptionPaywall: enabledFromRows(rows, APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, true),
      appSubscriptionGating: enabledFromRows(rows, APP_FEATURE_APP_SUBSCRIPTION_GATING, true),
    },
    rewardedAds: {
      androidEnabled: rewarded?.androidEnabled ?? false,
      dailyAdLimit: rewarded?.dailyAdLimit ?? 1,
      yandexAndroidPlacementId: rewarded?.yandexAndroidPlacementId ?? null,
      yandexIosPlacementId: rewarded?.yandexIosPlacementId ?? null,
      testMode: rewarded?.testMode ?? true,
    },
    updatedAt: policy?.updatedAt.toISOString() ?? null,
    updatedBy: policy?.updatedBy ?? null,
  };
}

export async function updateMobileReleaseControl(
  input: UpdateMobileReleaseControlInput, actorId: string,
): Promise<MobileReleaseControlDto> {
  const ota = normalizeOtaControl(input.ota);
  const archived = await getMobileReleaseControl();
  if (Object.keys(input.rewardedAds).some(key =>
    input.rewardedAds[key as keyof typeof input.rewardedAds] !==
    archived.rewardedAds[key as keyof typeof archived.rewardedAds]
  )) throw new RetiredRewardedAdsReadOnlyError();

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
    const updated = await tx.mobileAppReleasePolicy.updateMany({
      where: { key: RELEASE_POLICY_KEY, revision: input.revision },
      data: {
        otaRequired: ota.required,
        otaVersion: ota.version,
        otaPlatform: ota.platform,
        revision: { increment: 1 },
        updatedById: actorId,
      },
    });
    if (updated.count !== 1) throw new MobileReleaseControlConflictError();
    await Promise.all([
      tx.appFeatureFlag.upsert({
        where: { key: APP_FEATURE_APP_SUBSCRIPTION_PAYWALL },
        create: { key: APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, enabled: input.global.appSubscriptionPaywall },
        update: { enabled: input.global.appSubscriptionPaywall },
      }),
      tx.appFeatureFlag.upsert({
        where: { key: APP_FEATURE_APP_SUBSCRIPTION_GATING },
        create: { key: APP_FEATURE_APP_SUBSCRIPTION_GATING, enabled: input.global.appSubscriptionGating },
        update: { enabled: input.global.appSubscriptionGating },
      }),
    ]);
  });
  return getMobileReleaseControl();
}

export async function getMobileAppPublicConfig(
  context: ClientAppContext = { platform: "unknown", version: null },
) {
  const [policy, rows] = await Promise.all([
    prisma.mobileAppReleasePolicy.findUnique({
      where: { key: RELEASE_POLICY_KEY },
      select: { otaRequired: true, otaVersion: true, otaPlatform: true },
    }),
    prisma.appFeatureFlag.findMany({
      where: { key: { in: [APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, APP_FEATURE_APP_SUBSCRIPTION_GATING] } },
      select: { key: true, enabled: true },
    }),
  ]);
  return {
    appSubscriptionPaywallEnabled: enabledFromRows(rows, APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, true),
    appSubscriptionGatingEnabled: enabledFromRows(rows, APP_FEATURE_APP_SUBSCRIPTION_GATING, true),
    resolvedClientVersion: context.version,
    ota: {
      required: policy?.otaRequired ?? false,
      version: policy?.otaVersion ?? null,
      platform: (policy?.otaPlatform === "ios" || policy?.otaPlatform === "android"
        ? policy.otaPlatform : "all") as "ios" | "android" | "all",
      channel: "production" as const,
    },
    minimumSupportedVersion: {
      ios: getConfiguredVersion(process.env.MOBILE_IOS_MIN_VERSION),
      android: getConfiguredVersion(process.env.MOBILE_ANDROID_MIN_VERSION),
    },
    storeUrl: {
      ios: getConfiguredStoreUrl(process.env.MOBILE_IOS_STORE_URL, DEFAULT_IOS_STORE_URL),
      android: getConfiguredStoreUrl(process.env.MOBILE_ANDROID_STORE_URL, DEFAULT_ANDROID_STORE_URL),
    },
  };
}
