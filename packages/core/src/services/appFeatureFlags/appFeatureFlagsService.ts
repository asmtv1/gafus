import { prisma } from "@gafus/prisma";

/** Вход и привязка VK на iOS в мобильном приложении. */
export const APP_FEATURE_MOBILE_VK_LOGIN_IOS = "mobile_vk_login_ios";
/** Подсказка про оплату картами РФ на iOS в карточках платных курсов. */
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT = "mobile_ios_ru_card_payment_hint";
/** Кнопка оплаты картой РФ на iOS paywall. */
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT = "mobile_ios_ru_card_payment";
/** Rewarded-реклама на iOS. */
export const APP_FEATURE_MOBILE_REWARDED_ADS_IOS = "mobile_rewarded_ads_ios";
/** Включает автоматический показ paywall подписки в клиентах. */
export const APP_FEATURE_APP_SUBSCRIPTION_PAYWALL = "app_subscription_paywall_enabled";
/** Включает server-side блокировку платных действий без подписки. */
export const APP_FEATURE_APP_SUBSCRIPTION_GATING = "app_subscription_gating_enabled";

const RELEASE_POLICY_KEY = "default";
const REWARDED_SETTINGS_KEY = "default";
const CURRENT_MOBILE_VERSION = "1.6.5";
const DEFAULT_IOS_STORE_URL = "https://apps.apple.com/ru/app/gafus/id6760964612";
const DEFAULT_ANDROID_STORE_URL = "https://www.rustore.ru/catalog/app/ru.gafus.app";
const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const MAX_PLACEMENT_ID_LENGTH = 256;

const MOBILE_FLAG_DEFAULTS: Record<string, { released: boolean; review: boolean }> = {
  [APP_FEATURE_MOBILE_VK_LOGIN_IOS]: { released: false, review: false },
  [APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT]: { released: false, review: false },
  [APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT]: { released: false, review: false },
  [APP_FEATURE_MOBILE_REWARDED_ADS_IOS]: { released: false, review: false },
};

const MOBILE_VERSIONED_KEYS = Object.keys(MOBILE_FLAG_DEFAULTS);

export type ClientAppContext = {
  platform: "ios" | "android" | "unknown";
  version: string | null;
};

export type MobileFeatureProfile = "RELEASED" | "REVIEW";

export type MobileVersionedFeatureValues = {
  vkLogin: boolean;
  iosRuCardPayment: boolean;
  iosRuCardPaymentHint: boolean;
  rewardedAds: boolean;
};

export type MobileReleaseControlDto = {
  revision: number;
  iosReviewVersion: string | null;
  released: MobileVersionedFeatureValues;
  review: MobileVersionedFeatureValues;
  global: {
    appSubscriptionPaywall: boolean;
    appSubscriptionGating: boolean;
  };
  rewardedAds: {
    androidEnabled: boolean;
    yandexAndroidPlacementId: string | null;
    yandexIosPlacementId: string | null;
    testMode: boolean;
  };
  updatedAt: string | null;
  updatedBy: {
    id: string;
    username: string;
  } | null;
};

export type UpdateMobileReleaseControlInput = Omit<
  MobileReleaseControlDto,
  "updatedAt" | "updatedBy"
>;

export class MobileReleaseControlConflictError extends Error {
  readonly code = "STALE_CONFIG";

  constructor() {
    super("Настройки уже изменены в другой вкладке. Обновите страницу.");
    this.name = "MobileReleaseControlConflictError";
  }
}

function getConfiguredVersion(value: string | undefined): string {
  const version = value?.trim();
  return version && SEMANTIC_VERSION_PATTERN.test(version) ? version : CURRENT_MOBILE_VERSION;
}

function getConfiguredStoreUrl(value: string | undefined, fallback: string): string {
  const url = value?.trim();
  return url?.startsWith("https://") ? url : fallback;
}

function normalizeReviewVersion(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (!SEMANTIC_VERSION_PATTERN.test(normalized)) {
    throw new Error("Версия iOS должна быть в формате 1.6.4");
  }
  return normalized;
}

function normalizePlacementId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > MAX_PLACEMENT_ID_LENGTH) {
    throw new Error("Placement ID не должен быть длиннее 256 символов");
  }
  return normalized;
}

function validateRewardedSettings(input: UpdateMobileReleaseControlInput): {
  androidPlacementId: string | null;
  iosPlacementId: string | null;
} {
  const androidPlacementId = normalizePlacementId(input.rewardedAds.yandexAndroidPlacementId);
  const iosPlacementId = normalizePlacementId(input.rewardedAds.yandexIosPlacementId);
  if (!input.rewardedAds.testMode) {
    if (input.rewardedAds.androidEnabled && !androidPlacementId) {
      throw new Error("Укажите Yandex Android placement ID");
    }
    if ((input.released.rewardedAds || input.review.rewardedAds) && !iosPlacementId) {
      throw new Error("Укажите Yandex iOS placement ID");
    }
  }

  return { androidPlacementId, iosPlacementId };
}

function flagsToValues(
  rows: { key: string; enabled: boolean; reviewEnabled: boolean | null }[],
  profile: MobileFeatureProfile,
): MobileVersionedFeatureValues {
  const map = new Map(rows.map((row) => [row.key, row]));
  const value = (key: string): boolean => {
    const defaults = MOBILE_FLAG_DEFAULTS[key] ?? { released: false, review: false };
    const row = map.get(key);
    if (profile === "REVIEW") {
      return row?.reviewEnabled ?? defaults.review;
    }
    return row?.enabled ?? defaults.released;
  };
  return {
    vkLogin: value(APP_FEATURE_MOBILE_VK_LOGIN_IOS),
    iosRuCardPayment: value(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT),
    iosRuCardPaymentHint: value(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT),
    rewardedAds: value(APP_FEATURE_MOBILE_REWARDED_ADS_IOS),
  };
}

function releasedFlagFromRows(
  rows: { key: string; enabled: boolean }[],
  key: string,
  defaultEnabled: boolean,
): boolean {
  return rows.find((row) => row.key === key)?.enabled ?? defaultEnabled;
}

function featureValuesByKey(values: MobileVersionedFeatureValues): Record<string, boolean> {
  return {
    [APP_FEATURE_MOBILE_VK_LOGIN_IOS]: values.vkLogin,
    [APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT]: values.iosRuCardPayment,
    [APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT]: values.iosRuCardPaymentHint,
    [APP_FEATURE_MOBILE_REWARDED_ADS_IOS]: values.rewardedAds,
  };
}

export function resolveMobileFeatureProfile(
  context: ClientAppContext,
  iosReviewVersion: string | null,
): MobileFeatureProfile {
  if (
    context.platform === "ios" &&
    context.version !== null &&
    SEMANTIC_VERSION_PATTERN.test(context.version) &&
    iosReviewVersion !== null &&
    context.version === iosReviewVersion
  ) {
    return "REVIEW";
  }
  return "RELEASED";
}

/**
 * Читает глобальный булев флаг. Если записи нет — defaultEnabled.
 */
export async function getAppFeatureFlagEnabled(
  key: string,
  defaultEnabled = false,
): Promise<boolean> {
  const row = await prisma.appFeatureFlag.findUnique({
    where: { key },
    select: { enabled: true },
  });
  return row?.enabled ?? defaultEnabled;
}

/**
 * Создаёт или обновляет глобальное/released-значение флага.
 */
export async function setAppFeatureFlagEnabled(key: string, enabled: boolean): Promise<void> {
  await prisma.appFeatureFlag.upsert({
    where: { key },
    create: { key, enabled },
    update: { enabled },
  });
}

export async function getMobileFeatureFlagEnabled(
  key: string,
  context: ClientAppContext,
  defaultEnabled = false,
  defaultReviewEnabled = false,
): Promise<boolean> {
  const [row, policy] = await Promise.all([
    prisma.appFeatureFlag.findUnique({
      where: { key },
      select: { enabled: true, reviewEnabled: true },
    }),
    prisma.mobileAppReleasePolicy.findUnique({
      where: { key: RELEASE_POLICY_KEY },
      select: { iosReviewVersion: true },
    }),
  ]);
  const profile = resolveMobileFeatureProfile(context, policy?.iosReviewVersion ?? null);
  return profile === "REVIEW"
    ? (row?.reviewEnabled ?? defaultReviewEnabled)
    : (row?.enabled ?? defaultEnabled);
}

export async function getMobileReleaseControl(): Promise<MobileReleaseControlDto> {
  const [policy, rows, rewarded] = await Promise.all([
    prisma.mobileAppReleasePolicy.findUnique({
      where: { key: RELEASE_POLICY_KEY },
      select: {
        iosReviewVersion: true,
        revision: true,
        updatedAt: true,
        updatedBy: { select: { id: true, username: true } },
      },
    }),
    prisma.appFeatureFlag.findMany({
      where: {
        key: {
          in: [
            ...MOBILE_VERSIONED_KEYS,
            APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
            APP_FEATURE_APP_SUBSCRIPTION_GATING,
          ],
        },
      },
      select: { key: true, enabled: true, reviewEnabled: true },
    }),
    prisma.rewardedAdSettings.findUnique({ where: { key: REWARDED_SETTINGS_KEY } }),
  ]);

  return {
    revision: policy?.revision ?? 1,
    iosReviewVersion: policy?.iosReviewVersion ?? null,
    released: flagsToValues(rows, "RELEASED"),
    review: flagsToValues(rows, "REVIEW"),
    global: {
      appSubscriptionPaywall: releasedFlagFromRows(
        rows,
        APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
        true,
      ),
      appSubscriptionGating: releasedFlagFromRows(rows, APP_FEATURE_APP_SUBSCRIPTION_GATING, true),
    },
    rewardedAds: {
      androidEnabled: rewarded?.androidEnabled ?? false,
      yandexAndroidPlacementId: rewarded?.yandexAndroidPlacementId ?? null,
      yandexIosPlacementId: rewarded?.yandexIosPlacementId ?? null,
      testMode: rewarded?.testMode ?? true,
    },
    updatedAt: policy?.updatedAt.toISOString() ?? null,
    updatedBy: policy?.updatedBy ?? null,
  };
}

export async function updateMobileReleaseControl(
  input: UpdateMobileReleaseControlInput,
  actorId: string,
): Promise<MobileReleaseControlDto> {
  const iosReviewVersion = normalizeReviewVersion(input.iosReviewVersion);
  const { androidPlacementId, iosPlacementId } = validateRewardedSettings(input);
  const releasedByKey = featureValuesByKey(input.released);
  const reviewByKey = featureValuesByKey(input.review);

  await prisma.$transaction(async (tx) => {
    const policyUpdate = await tx.mobileAppReleasePolicy.updateMany({
      where: { key: RELEASE_POLICY_KEY, revision: input.revision },
      data: {
        iosReviewVersion,
        revision: { increment: 1 },
        updatedById: actorId,
      },
    });
    if (policyUpdate.count !== 1) {
      throw new MobileReleaseControlConflictError();
    }

    await Promise.all(
      MOBILE_VERSIONED_KEYS.map((key) =>
        tx.appFeatureFlag.upsert({
          where: { key },
          create: {
            key,
            enabled: releasedByKey[key] ?? false,
            reviewEnabled: reviewByKey[key] ?? false,
          },
          update: {
            enabled: releasedByKey[key] ?? false,
            reviewEnabled: reviewByKey[key] ?? false,
          },
        }),
      ),
    );

    await Promise.all([
      tx.appFeatureFlag.upsert({
        where: { key: APP_FEATURE_APP_SUBSCRIPTION_PAYWALL },
        create: {
          key: APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
          enabled: input.global.appSubscriptionPaywall,
        },
        update: { enabled: input.global.appSubscriptionPaywall },
      }),
      tx.appFeatureFlag.upsert({
        where: { key: APP_FEATURE_APP_SUBSCRIPTION_GATING },
        create: {
          key: APP_FEATURE_APP_SUBSCRIPTION_GATING,
          enabled: input.global.appSubscriptionGating,
        },
        update: { enabled: input.global.appSubscriptionGating },
      }),
      tx.rewardedAdSettings.upsert({
        where: { key: REWARDED_SETTINGS_KEY },
        create: {
          key: REWARDED_SETTINGS_KEY,
          androidEnabled: input.rewardedAds.androidEnabled,
          iosEnabled: input.released.rewardedAds,
          yandexAndroidPlacementId: androidPlacementId,
          yandexIosPlacementId: iosPlacementId,
          testMode: input.rewardedAds.testMode,
          updatedById: actorId,
        },
        update: {
          androidEnabled: input.rewardedAds.androidEnabled,
          iosEnabled: input.released.rewardedAds,
          yandexAndroidPlacementId: androidPlacementId,
          yandexIosPlacementId: iosPlacementId,
          testMode: input.rewardedAds.testMode,
          updatedById: actorId,
        },
      }),
    ]);
  });

  return getMobileReleaseControl();
}

/**
 * Публичные настройки мобильного клиента для конкретной версии.
 */
export async function getMobileAppPublicConfig(
  context: ClientAppContext = { platform: "unknown", version: null },
): Promise<{
  vkLoginEnabledOnIos: boolean;
  appSubscriptionPaywallEnabled: boolean;
  appSubscriptionGatingEnabled: boolean;
  iosRuCardPaymentEnabled: boolean;
  iosRuCardPaymentHintEnabled: boolean;
  resolvedFeatureProfile: MobileFeatureProfile;
  resolvedClientVersion: string | null;
  minimumSupportedVersion: {
    ios: string;
    android: string;
  };
  storeUrl: {
    ios: string;
    android: string;
  };
}> {
  const [policy, rows] = await Promise.all([
    prisma.mobileAppReleasePolicy.findUnique({
      where: { key: RELEASE_POLICY_KEY },
      select: { iosReviewVersion: true },
    }),
    prisma.appFeatureFlag.findMany({
      where: {
        key: {
          in: [
            ...MOBILE_VERSIONED_KEYS,
            APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
            APP_FEATURE_APP_SUBSCRIPTION_GATING,
          ],
        },
      },
      select: { key: true, enabled: true, reviewEnabled: true },
    }),
  ]);

  const resolvedFeatureProfile = resolveMobileFeatureProfile(
    context,
    policy?.iosReviewVersion ?? null,
  );
  const mobileFlags = flagsToValues(rows, resolvedFeatureProfile);
  const appSubscriptionPaywallEnabled = releasedFlagFromRows(
    rows,
    APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
    true,
  );
  const appSubscriptionGatingEnabled = releasedFlagFromRows(
    rows,
    APP_FEATURE_APP_SUBSCRIPTION_GATING,
    true,
  );

  return {
    vkLoginEnabledOnIos: mobileFlags.vkLogin,
    appSubscriptionPaywallEnabled,
    appSubscriptionGatingEnabled,
    iosRuCardPaymentEnabled: mobileFlags.iosRuCardPayment,
    iosRuCardPaymentHintEnabled: mobileFlags.iosRuCardPaymentHint,
    resolvedFeatureProfile,
    resolvedClientVersion: context.version,
    minimumSupportedVersion: {
      ios: getConfiguredVersion(process.env.MOBILE_IOS_MIN_VERSION),
      android: getConfiguredVersion(process.env.MOBILE_ANDROID_MIN_VERSION),
    },
    storeUrl: {
      ios: getConfiguredStoreUrl(process.env.MOBILE_IOS_STORE_URL, DEFAULT_IOS_STORE_URL),
      android: getConfiguredStoreUrl(
        process.env.MOBILE_ANDROID_STORE_URL,
        DEFAULT_ANDROID_STORE_URL,
      ),
    },
  };
}
