#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [directory, profile = "standard"] = process.argv.slice(2);
if (!directory || !["standard", "android-qa-yookassa"].includes(profile)) {
  throw new Error("Usage: verify-android-payment-export.mjs <export directory> [standard|android-qa-yookassa]");
}

const maps = readdirSync(directory, { recursive: true }).filter((file) =>
  file.endsWith(".map") && /(?:^|[/\\])android(?:[/\\]|-)/.test(file));
const sources = maps.flatMap((file) => {
  const map = JSON.parse(readFileSync(path.join(directory, file), "utf8"));
  return map.sources.map((source) => source.replaceAll("\\", "/"));
});
const has = (pattern) => sources.some((source) => pattern.test(source));
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
