// Explicitly keep raw GPS diagnostics off for every public/recovery bundle.
// The new route engine is enabled only for the signed iOS 101 release.
export const IOS_WALK_TITLE = "iOS 101 — Smart Tracking GPS и Yandex CDN";
export function walkTrackingReleaseEnv(env) {
  const safe = {
    EXPO_PUBLIC_WALK_TRACKING_ENGINE: "v1",
    EXPO_PUBLIC_WALK_TRACKING_VARIANT: "",
    EXPO_PUBLIC_WALK_QA_CAPTURE: "0",
    EXPO_PUBLIC_WALK_QA_GPS_PROFILE: "",
    EXPO_PUBLIC_WALK_FINAL_DISPLAY: "0",
    EXPO_PUBLIC_WALK_BACKTRACK: "0",
  };
  if (env.OTA_RELEASE_TITLE !== IOS_WALK_TITLE) return safe;
  if (env.CI !== "true" || env.GAFUS_OTA_PRODUCTION_APPROVED !== "true" ||
      env.APP_ENV !== "production" || env.OTA_PLATFORM !== "ios" ||
      env.OTA_RUNTIME !== "1.7.5" ||
      env.OTA_NATIVE_ID !== "0093f03d-3a04-4968-878c-c7e30f77fa66" ||
      env.OTA_PAYMENT_CONTENT !== "ios-public-yookassa" || env.OTA_RECOVERY_FOR)
    throw Error("IOS_SMART_TRACKING_RELEASE_TARGET_INVALID");
  return {
    ...safe,
    EXPO_PUBLIC_WALK_TRACKING_ENGINE: "v2",
    EXPO_PUBLIC_WALK_TRACKING_VARIANT: "median",
    EXPO_PUBLIC_WALK_FINAL_DISPLAY: "1",
    EXPO_PUBLIC_WALK_BACKTRACK: "1",
  };
}
