import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
