import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { checkoutComponent, paymentProfile } from "./ota-payment-profile.mjs";

test("standard is the default, including recovery, and unknown profiles fail closed", () => {
  assert.equal(paymentProfile({}), "standard");
  assert.equal(checkoutComponent(paymentProfile({ OTA_RECOVERY_FOR: "5" })), null);
  assert.throws(() => paymentProfile({ OTA_PAYMENT_CONTENT: "typo" }), /UNKNOWN_PAYMENT_PROFILE/);
});

for (const [platform, profile, component] of [
  ["ios", "internal-yookassa", "InternalCardCheckout"],
  ["android", "android-qa-yookassa", "AndroidQaCardCheckout"],
]) {
  test(`${platform} internal checkout rejects public distributions`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "gafus-ota-appstore-profile-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, "native.json");
    const native = {
      id: "native", platform, verified: true, distribution: "app-store",
      appId: "gafus", bundleId: "ru.gafus.app", environment: "production", channel: "production",
      nativeFingerprint: "a".repeat(64), signingKeyId: "test",
      embeddedUpdateId: "1c6522de-7a97-48a3-b04c-1dbf36646239",
    };
    const env = { CI: "true", GAFUS_OTA_PRODUCTION_APPROVED: "true", OTA_PAYMENT_CONTENT: profile,
      GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR: file, OTA_PLATFORM: platform, OTA_NATIVE_ID: "native" };
    for (const runtime of ["1.7.5", "1.7.6"]) {
      writeFileSync(file, JSON.stringify({ ...native, runtimeVersion: runtime, appVersion: runtime }));
      assert.throws(() => paymentProfile({ ...env, OTA_RUNTIME: runtime }), /FORBIDDEN/);
    }
  });
  test(`${platform} checkout accepts each verified compatible runtime independently`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "gafus-ota-payment-profile-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, "native.json");
    const descriptor = {
      id: "native", platform, verified: true, distribution: "internal",
      appId: "gafus", bundleId: "ru.gafus.app", environment: "production", channel: "production",
      nativeFingerprint: "a".repeat(64), signingKeyId: "test",
      embeddedUpdateId: "1c6522de-7a97-48a3-b04c-1dbf36646239",
    };
    const env = {
      CI: "true", GAFUS_OTA_PRODUCTION_APPROVED: "true",
      OTA_PAYMENT_CONTENT: profile, GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR: file,
      OTA_PLATFORM: platform, OTA_NATIVE_ID: "native",
    };
    for (const runtime of ["1.7.5", "1.7.6"]) {
      writeFileSync(file, JSON.stringify({ ...descriptor, runtimeVersion: runtime, appVersion: runtime }));
      assert.equal(checkoutComponent(paymentProfile({ ...env, OTA_RUNTIME: runtime })), component);
    }
    for (const override of [
      { OTA_PLATFORM: "web" }, { OTA_RUNTIME: "1.7.5" }, { OTA_NATIVE_ID: "other" },
      { OTA_RECOVERY_FOR: "10" }, { GAFUS_OTA_PRODUCTION_APPROVED: "false" },
    ]) assert.throws(() => paymentProfile({ ...env, OTA_RUNTIME: "1.7.6", ...override }), /FORBIDDEN/);

    for (const override of [
      { distribution: "app-store" }, { nativeFingerprint: "" }, { verified: false },
      { embeddedUpdateId: null }, { signingKeyId: "" }, { channel: "preview" },
    ]) {
      writeFileSync(file, JSON.stringify({
        ...descriptor, runtimeVersion: "1.7.6", appVersion: "1.7.6", ...override,
      }));
      assert.throws(() => paymentProfile({ ...env, OTA_RUNTIME: "1.7.6" }), /FORBIDDEN/);
    }
  });
}


test("ios-public-yookassa requires the verified iOS 1.7.5 App Store native", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "gafus-ota-public-profile-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "native.json");
  const native = {
    id: "native", platform: "ios", verified: true, distribution: "app-store",
    appId: "gafus", bundleId: "ru.gafus.app", environment: "production", channel: "production",
    nativeFingerprint: "a".repeat(64), signingKeyId: "test",
    embeddedUpdateId: "1c6522de-7a97-48a3-b04c-1dbf36646239",
    runtimeVersion: "1.7.5", appVersion: "1.7.5",
  };
  const env = {
    CI: "true", GAFUS_OTA_PRODUCTION_APPROVED: "true", OTA_PAYMENT_CONTENT: "ios-public-yookassa",
    GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR: file, OTA_PLATFORM: "ios", OTA_RUNTIME: "1.7.5",
    OTA_NATIVE_ID: "native",
  };
  writeFileSync(file, JSON.stringify(native));
  assert.equal(checkoutComponent(paymentProfile(env)), "InternalCardCheckout");
  for (const override of [
    { distribution: "internal" }, { platform: "android" }, { runtimeVersion: "1.7.6", appVersion: "1.7.6" },
    { verified: false }, { embeddedUpdateId: null }, { nativeFingerprint: "" },
  ]) {
    writeFileSync(file, JSON.stringify({ ...native, ...override }));
    assert.throws(() => paymentProfile(env), /FORBIDDEN/);
  }
  writeFileSync(file, JSON.stringify(native));
  for (const override of [
    { OTA_RECOVERY_FOR: "1" }, { CI: "false" }, { GAFUS_OTA_PRODUCTION_APPROVED: "false" },
    { OTA_RUNTIME: "1.7.6" }, { OTA_PLATFORM: "android" },
  ]) assert.throws(() => paymentProfile({ ...env, ...override }), /FORBIDDEN/);
});


test("iOS 1.7.5 visual checkout reproduces original 1.7.2 premium cards exactly",()=>{
  const visual=readFileSync(new URL("../src/features/app-subscription/components/Premium172Appearance.tsx",import.meta.url),"utf8");
  const originalStyleBody=visual.split("export const premium172Styles = StyleSheet.create({")[1];
  assert.ok(originalStyleBody,"Premium 1.7.2 style sheet is missing");
  assert.equal(createHash("sha256").update(originalStyleBody).digest("hex"),
    "9089b897d35086bd72a5d1e514c342f06683afa9c6cb9dc5d668a9a4180bb060",
    "Original 1.7.2 colors, card radii, shadows, font sizes and promo visuals must remain exact");
  const checkout=readFileSync(new URL("../src/features/app-subscription/components/InternalCardCheckout.tsx",import.meta.url),"utf8");
  for(const part of ["styles.planCardSelected", "styles.planPrice", "styles.badgeChip", "styles.benefits",
    "styles.selectedRow", "getYookassaPrimaryCta", "sbp-logo.svg", "Premium172BenefitRow",
    "styles.providerCaption", "styles.legalText"])
    assert.ok(checkout.includes(part),`Lost original Premium presentation element: ${part}`);
  const paywall=readFileSync(new URL("../src/features/app-subscription/components/AppSubscriptionPaywall.ios.tsx",import.meta.url),"utf8");
  assert.ok(paywall.indexOf("<OptionalCardCheckout") < paywall.indexOf('>App Store</Text>'),
    "YooKassa provider must precede the StoreKit provider as in version 1.7.2");
  assert.ok(paywall.includes("styles.appleCard") && paywall.includes("styles.appleBenefits"));
  assert.ok(paywall.includes("runAppleAppSubscriptionPurchase") && paywall.includes("createAppleTokenInitializationAdapter"),
    "Restoring the old appearance must not undo secure StoreKit purchase flow");
});
