/** Smart Tracking QA candidate: explicit title + matching verified native target.
 * The signed bundle must only be deployed to named testers. No data is captured
 * without the in-app consent, and the next normal/recovery export stays off.
 */
export const SMART_TRACKING_QA_TITLE = "Smart Tracking QA — 1.7.5";
export function smartTrackingQaEnv(env) {
  if (env.OTA_RELEASE_TITLE !== SMART_TRACKING_QA_TITLE) return {};
  if (env.APP_ENV !== "production" || env.OTA_RUNTIME !== "1.7.5" ||
      env.OTA_RECOVERY_FOR ||
      !((env.OTA_PLATFORM === "ios" && env.OTA_PAYMENT_CONTENT === "ios-public-yookassa") ||
        (env.OTA_PLATFORM === "android" && env.OTA_PAYMENT_CONTENT === "android-rustore-yookassa"))) {
    throw Error("SMART_TRACKING_QA_TARGET_INVALID");
  }
  return {
    EXPO_PUBLIC_WALK_TRACKING_ENGINE: "v2",
    EXPO_PUBLIC_WALK_TRACKING_VARIANT: "median",
    EXPO_PUBLIC_WALK_QA_CAPTURE: "1",
    EXPO_PUBLIC_WALK_QA_GPS_PROFILE: "control",
    EXPO_PUBLIC_WALK_FINAL_DISPLAY: "1",
    EXPO_PUBLIC_WALK_BACKTRACK: "1",
  };
}
