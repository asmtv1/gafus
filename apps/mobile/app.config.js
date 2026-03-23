/** Динамический конфиг: прокидывает env в extra для Constants.expoConfig */
const path = require("path");
require("@expo/env").load(path.resolve(__dirname, "../.."), { force: true });

const vkClientIdAndroid = process.env.VK_CLIENT_ID_ANDROID ?? "";

const vkIntentFilters =
  vkClientIdAndroid
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
  android: {
    ...config.android,
    intentFilters: [
      ...(config.android?.intentFilters ?? []),
      ...vkIntentFilters,
    ],
  },
  plugins: [
    ...(config.plugins ?? []),
    ["expo-web-browser", { experimentalLauncherActivity: true }],
  ],
  extra: {
    ...config.extra,
    appVersion:
      process.env.EXPO_PUBLIC_APP_VERSION ?? config.version ?? "1.1.0",
    enableTracer: process.env.EXPO_PUBLIC_ENABLE_TRACER === "true",
    tracerAppToken: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN,
    tracerAppTokenIos: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_IOS,
    tracerAppTokenAndroid: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID,
    vkClientId: process.env.VK_CLIENT_ID ?? "",
    vkClientIdIos: process.env.VK_CLIENT_ID_IOS ?? "",
    vkClientIdAndroid: process.env.VK_CLIENT_ID_ANDROID ?? "",
    vkMobileRedirectUri: process.env.VK_MOBILE_REDIRECT_URI ?? "gafus://auth/vk",
  },
});
