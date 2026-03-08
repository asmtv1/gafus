/** Динамический конфиг: прокидывает env в extra для Constants.expoConfig */
const path = require("path");
require("@expo/env").load(path.resolve(__dirname, "../.."), { force: true });

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    "expo-web-browser",
  ],
  extra: {
    ...config.extra,
    appVersion:
      process.env.EXPO_PUBLIC_APP_VERSION ?? config.version ?? "1.0.0",
    enableTracer: process.env.EXPO_PUBLIC_ENABLE_TRACER === "true",
    tracerAppToken: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN,
    vkClientId: process.env.VK_CLIENT_ID ?? "",
    vkClientIdIos: process.env.VK_CLIENT_ID_IOS ?? "",
    vkClientIdAndroid: process.env.VK_CLIENT_ID_ANDROID ?? "",
    vkMobileRedirectUri: process.env.VK_MOBILE_REDIRECT_URI ?? "gafus://auth/vk",
  },
});
