#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const [aab] = process.argv.slice(2);
if (!aab) throw new Error("Usage: verify-android-payment-aab.mjs <standard Android AAB>");
const paths = execFileSync("unzip", ["-Z1", aab], { encoding: "utf8" }).split("\n");
const read = (entry) => execFileSync("unzip", ["-p", aab, entry], { maxBuffer: 128 * 1024 * 1024 });
const dex = paths.filter((file) => /^base\/dex\/classes\d*\.dex$/.test(file)).map(read);
const bundleEntry = paths.find((file) => /^base\/assets\/index\.android\.bundle$/.test(file));
if (!bundleEntry || !dex.length) throw new Error("Missing Android bundle or DEX");
const code = read(bundleEntry);
if (!read("base/manifest/AndroidManifest.xml").includes("com.android.vending.BILLING") ||
    !dex.some((file) => file.includes("com/android/billingclient/api/BillingClient")) ||
    !dex.some((file) => file.includes("expo/modules/webbrowser")) ||
    !code.includes("/google/play/verify")) {
  throw new Error("Missing Google Play Billing or Expo browser support");
}
if (dex.some((file) => file.includes("GafusYooKassaPaymentsModule") || file.includes("ru/yoomoney/sdk")) ||
    code.includes("Оплата через ЮKassa") || code.includes("/yookassa/start")) {
  throw new Error("Unexpected checkout code in standard Android AAB");
}
// Standard Google Play / RuStore AAB must not embed the retired RuStore Push SDK.
// Keep this native gate: removing the JS import alone is not enough to remove DEX classes.
const retiredPushMarkers = [
  "com/vk/push/",
  "com.vk.push.",
  "VkpnsClientSdk",
  "RustorePushModule",
  "RustorePushPackage",
];
if (dex.some((file) => retiredPushMarkers.some((marker) => file.includes(marker))) ||
    paths.some((file) => /vkpns|react-native-rustore-push/i.test(file)) ||
    code.includes("react-native-rustore-push") || code.includes("RustorePush")) {
  throw new Error("Unexpected RuStore Push native SDK or JS code in standard Android AAB");
}
console.log("Android payment AAB PASS");
