#!/usr/bin/env node
/** Extra guard for the *actual* Expo/iOS Hermes artifact (not just TS imports). */
import fs from "node:fs";
import path from "node:path";

import {paymentProfile} from "./ota-payment-profile.mjs";
export function inspectIosPaymentExport(exportRoot) {
  const metadata = JSON.parse(fs.readFileSync(path.join(exportRoot, "metadata.json"), "utf8"));
  const bundleName = metadata.fileMetadata?.ios?.bundle;
  if (typeof bundleName !== "string" || bundleName.includes("..") || path.isAbsolute(bundleName))
    throw new Error("INVALID_IOS_EXPO_BUNDLE");
  const bundlePath = path.join(exportRoot, bundleName);
  const bundle = fs.readFileSync(bundlePath);
  if (bundle.length < 1000) throw new Error("IOS_BUNDLE_TOO_SMALL");
  const blockedStrings = [
    "/yookassa/start",
    "/promo-code/preview",
    "/registration-promo-preview",
    "startYookassa",
    "yookassaAppSubscriptionPurchase",
    "yookassaPriceRubCheckout",
  ];
  const hits = blockedStrings.filter((token) => bundle.includes(Buffer.from(token)));
  if (["internal-yookassa", "ios-public-yookassa"].includes(paymentProfile())) {
    if(!hits.includes("/yookassa/start") || hits.some(hit=>hit!=="/yookassa/start") ||
      !bundle.includes(Buffer.from("gafus://subscription-return")))throw Error("IOS_INTERNAL_CHECKOUT_EXPORT_MISMATCH");
    return {bundleName,sizeBytes:bundle.length,assetCount:metadata.fileMetadata.ios.assets.length};
  }
  if (hits.length > 0) throw new Error(`IOS_EXPO_CHECKOUT_GRAPH_FORBIDDEN: ${hits.join(", ")}`);
  return { bundleName, sizeBytes: bundle.length, assetCount: metadata.fileMetadata.ios.assets.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = process.argv[2];
  if (!root) {
    console.error("Usage: node verify-ios-payment-export.mjs <expo-export-output>");
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify({ ok: true, ...inspectIosPaymentExport(root) })); }
    catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; }
  }
}
