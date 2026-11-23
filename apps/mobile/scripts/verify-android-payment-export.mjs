#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [directory, profile = "standard"] = process.argv.slice(2);
if (!directory || !["standard", "android-qa-yookassa", "android-rustore-yookassa"].includes(profile)) {
  throw new Error("Usage: verify-android-payment-export.mjs <export directory> [standard|android-qa-yookassa]");
}

const maps = readdirSync(directory, { recursive: true }).filter((file) =>
  file.endsWith(".map") && /(?:^|[/\\])android(?:[/\\]|-)/.test(file));
const sources = maps.flatMap((file) => {
  const map = JSON.parse(readFileSync(path.join(directory, file), "utf8"));
  return map.sources.map((source) => source.replaceAll("\\", "/"));
});
const has = (pattern) => sources.some((source) => pattern.test(source));
if (profile === "android-rustore-yookassa") {
  const required = [
    /AppSubscriptionPaywall\.rustore\.tsx$/,
    /InternalCardCheckout\.tsx$/,
    /Premium172Appearance\.tsx$/,
    /SignedOtaPromoPresentation\.ts$/,
    /GooglePlayPurchaseSync\.tsx$/,
  ];
  for (const pattern of required) if (!has(pattern))
    throw Error(`RUSTORE_175_SIGNED_PAYMENT_MODULE_MISSING_${pattern}`);
  if (has(/AppSubscriptionPaywall\.android\.tsx$|GooglePlayPurchaseSync\.android\.tsx$|AndroidQaCardCheckout\.tsx$|appSubscriptionApi\.android\.ts$|appSubscriptionGoogleApi\.ts$/))
    throw Error("RUSTORE_EXPORT_CONTAINS_PLAY_OR_QA_ENTRYPOINT");
  const metadata = JSON.parse(readFileSync(path.join(directory, "metadata.json"), "utf8"));
  const bundle = readFileSync(path.join(directory, metadata.fileMetadata.android.bundle));
  if (!bundle.includes("/yookassa/start") || !bundle.includes("/promo-code/preview") ||
      bundle.includes("/google/play/verify")) throw Error("RUSTORE_PAYMENT_BUNDLE_INCORRECT");
  console.log("Android RuStore 1.7.5 signed YooKassa + promo export PASS (" + sources.length + " sources)");
  process.exit(0);
}
if (!has(/AppSubscriptionPaywall\.android\.tsx$/) || !has(/appSubscriptionGoogleApi\.ts$/) || !has(/expo-iap/)) {
  throw new Error("Missing Android Google Play Billing modules in Metro export");
}
if (has(/AppSubscriptionPaywall\.tsx$|AppSubscriptionPaywall\.ios\.tsx$|yookassaAppSubscriptionPurchase|\/yookassa-payments\/|\/api\/appSubscriptionApi\.ts$/i)) {
  throw new Error("Legacy checkout or iOS payment code in Android Metro export");
}
const qa = profile === "android-qa-yookassa";
if (has(/\/AndroidQaCardCheckout\.tsx$/) !== qa || has(/\/InternalCardCheckout\.tsx$/) !== qa) {
  throw new Error("Android checkout modules do not match the selected profile");
}
const metadata = JSON.parse(readFileSync(path.join(directory, "metadata.json"), "utf8"));
const bundle = readFileSync(path.join(directory, metadata.fileMetadata.android.bundle));
if (!bundle.includes("/google/play/verify") || bundle.includes("/yookassa/start") !== qa) {
  throw new Error("Android bundle checkout endpoints do not match the selected profile");
}
console.log("Android payment export PASS (" + profile + ", " + sources.length + " sources)");
