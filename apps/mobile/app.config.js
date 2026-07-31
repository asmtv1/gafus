/** Динамический конфиг: прокидывает env в extra для Constants.expoConfig */
const path = require("path");
const { load } = require("@expo/env");

// Загружаем env в правильном порядке:
// 1. Локальный apps/mobile/.env (если есть) — для локальных EAS-сборок
// 2. Корневой .env монорепо — для dev-режима и как fallback
// dotenv не перезаписывает уже установленные переменные,
// поэтому значения из eas.json env секции имеют наивысший приоритет.
load(path.resolve(__dirname), { force: true });
load(path.resolve(__dirname, "../.."), { force: true });

const vkClientIdAndroid = process.env.VK_CLIENT_ID_ANDROID ?? "";
const vkClientIdIos = process.env.VK_CLIENT_ID_IOS ?? "";
const productionApiBaseUrl = "https://api.gafus.ru";
const yandexSkAdNetworkIdentifiers = ["zq492l623r.skadnetwork"];

function assertProductionApiBaseUrl() {
  if (process.env.APP_ENV !== "production") return;

  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? productionApiBaseUrl;
  if (apiBaseUrl !== productionApiBaseUrl) {
    throw new Error(`Production mobile builds must use ${productionApiBaseUrl}; got ${apiBaseUrl}`);
  }
}

assertProductionApiBaseUrl();

function withYandexSkAdNetworkItems(infoPlist = {}) {
  const existingItems = Array.isArray(infoPlist.SKAdNetworkItems) ? infoPlist.SKAdNetworkItems : [];
  const existingIds = new Set(
    existingItems.map((item) => item?.SKAdNetworkIdentifier).filter((id) => typeof id === "string"),
  );
  const yandexItems = yandexSkAdNetworkIdentifiers
    .filter((id) => !existingIds.has(id))
    .map((id) => ({ SKAdNetworkIdentifier: id }));

  return {
    ...infoPlist,
    SKAdNetworkItems: [...existingItems, ...yandexItems],
  };
}

/** Схемы deep link: gafus + vk{id} для OAuth VK ID (iOS требует регистрации в Info.plist). */
function resolveSchemes(baseConfig) {
  const base = baseConfig.scheme ?? "gafus";
  const list = Array.isArray(base) ? [...base] : [base];
  const out = list.filter(Boolean);
  if (vkClientIdIos && !out.includes(`vk${vkClientIdIos}`)) {
    out.push(`vk${vkClientIdIos}`);
  }
  return out.length === 1 ? out[0] : out;
}

const vkIntentFilters = vkClientIdAndroid
  ? [
      {
        action: "VIEW",
        data: [
          { scheme: `vk${vkClientIdAndroid}`, host: "vk.ru" },
          {
            scheme: `vk${vkClientIdAndroid}`,
            host: "vk.ru",
            pathPrefix: "/blank.html",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]
  : [];

module.exports = ({ config }) => ({
  ...config,
  scheme: resolveSchemes(config),
  ios: {
    ...config.ios,
    infoPlist: withYandexSkAdNetworkItems(config.ios?.infoPlist),
  },
  android: {
    ...config.android,
    intentFilters: [...(config.android?.intentFilters ?? []), ...vkIntentFilters],
  },
  plugins: [
    ...(config.plugins ?? []),
    ["expo-web-browser", { experimentalLauncherActivity: true }],
  ],
  extra: {
    ...config.extra,
    appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? config.version ?? "1.6.4",
    enableTracer: process.env.EXPO_PUBLIC_ENABLE_TRACER === "true",
    tracerAppToken: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN,
    tracerAppTokenJs: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_JS,
    tracerAppTokenIos: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_IOS,
    tracerAppTokenAndroid: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID,
    vkClientId: process.env.VK_CLIENT_ID ?? "",
    vkClientIdIos: process.env.VK_CLIENT_ID_IOS ?? "",
    vkClientIdAndroid: process.env.VK_CLIENT_ID_ANDROID ?? "",
    vkMobileRedirectUri: process.env.VK_MOBILE_REDIRECT_URI ?? "gafus://auth/vk",
    ymMobileApiKey: process.env.EXPO_PUBLIC_YM_MOBILE_API_KEY ?? "",
    ymMobileEnabled: process.env.EXPO_PUBLIC_YM_MOBILE_ENABLED === "true",
    rewardedAdsAndroidPlacementId: process.env.EXPO_PUBLIC_REWARDED_ADS_ANDROID_PLACEMENT_ID ?? "",
    rewardedAdsIosPlacementId: process.env.EXPO_PUBLIC_REWARDED_ADS_IOS_PLACEMENT_ID ?? "",
    rewardedAdsTestMode: process.env.EXPO_PUBLIC_REWARDED_ADS_TEST_MODE === "true",
    analyticsDebug: process.env.EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG === "1",
  },
});
