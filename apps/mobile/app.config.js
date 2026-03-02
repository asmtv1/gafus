/** Динамический конфиг: прокидывает env в extra для Constants.expoConfig */
export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    appVersion:
      process.env.EXPO_PUBLIC_APP_VERSION ?? config.version ?? "1.0.0",
    enableTracer: process.env.EXPO_PUBLIC_ENABLE_TRACER === "true",
    tracerAppToken: process.env.EXPO_PUBLIC_TRACER_APP_TOKEN,
  },
});
