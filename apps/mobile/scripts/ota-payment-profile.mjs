import fs from "node:fs";

const profiles = {
  "internal-yookassa": { platform: "ios", component: "InternalCardCheckout" },
  "ios-public-yookassa": { platform: "ios", component: "InternalCardCheckout" },
  "android-qa-yookassa": { platform: "android", component: "AndroidQaCardCheckout" },
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function paymentProfile(env = process.env) {
  const profile = env.OTA_PAYMENT_CONTENT ?? "standard";
  if (profile === "standard") return profile;
  if (!Object.hasOwn(profiles, profile) || !env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR)
    throw Error("UNKNOWN_PAYMENT_PROFILE");

  // Protected CI fetches this descriptor from the native registry, then checks
  // its pinned signing certificate and the exact source fingerprint.
  const native = JSON.parse(fs.readFileSync(env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR, "utf8"));
  if (
    env.CI !== "true" ||
    env.GAFUS_OTA_PRODUCTION_APPROVED !== "true" ||
    native.id !== env.OTA_NATIVE_ID ||
    native.verified !== true ||
    !uuid.test(native.embeddedUpdateId ?? "") ||
    !((profile !== "ios-public-yookassa" && native.distribution === "internal") ||
      (profile === "ios-public-yookassa" && native.distribution === "app-store" && native.runtimeVersion === "1.7.5")) ||
    native.platform !== profiles[profile].platform ||
    native.platform !== env.OTA_PLATFORM ||
    native.appId !== "gafus" ||
    native.bundleId !== "ru.gafus.app" ||
    native.environment !== "production" ||
    native.channel !== "production" ||
    !/^\d+\.\d+\.\d+$/.test(native.runtimeVersion ?? "") ||
    !/^[a-f0-9]{64}$/.test(native.nativeFingerprint ?? "") ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(native.signingKeyId ?? "") ||
    native.appVersion !== native.runtimeVersion ||
    native.runtimeVersion !== env.OTA_RUNTIME ||
    env.OTA_RECOVERY_FOR
  )
    throw Error("CHECKOUT_NATIVE_DISTRIBUTION_FORBIDDEN");
  return profile;
}

export function checkoutComponent(profile) {
  return Object.hasOwn(profiles, profile) ? profiles[profile].component : null;
}
