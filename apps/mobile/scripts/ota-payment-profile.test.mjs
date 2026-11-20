import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { internalCheckoutProfile } from "./ota-payment-profile.mjs";

test("Android checkout requires a verified internal Android descriptor with exact runtime and fingerprint", () => {
  const dir = mkdtempSync(join(tmpdir(), "gafus-ota-payment-profile-"));
  try {
    const file = join(dir, "native.json");
    const descriptor = {
      id: "native", platform: "android", verified: true, distribution: "internal",
      appId: "gafus", bundleId: "ru.gafus.app", environment: "production", channel: "production",
      runtimeVersion: "1.7.5", appVersion: "1.7.5", nativeFingerprint: "a".repeat(64),
    };
    const env = {
      OTA_PAYMENT_CONTENT: "android-qa-yookassa", GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR: file,
      OTA_PLATFORM: "android", OTA_RUNTIME: "1.7.5", OTA_NATIVE_ID: "native",
    };
    writeFileSync(file, JSON.stringify(descriptor));
    assert.equal(internalCheckoutProfile(env), true);
    assert.equal(internalCheckoutProfile({ ...env, OTA_PAYMENT_CONTENT: "standard" }), false);
    for (const override of [
      { OTA_PLATFORM: "ios" }, { OTA_RUNTIME: "1.7.4" }, { OTA_RECOVERY_FOR: "10" },
      { OTA_PAYMENT_CONTENT: "internal-yookassa" },
    ]) assert.throws(() => internalCheckoutProfile({ ...env, ...override }), /FORBIDDEN/);
    for (const override of [
      { distribution: "store" }, { nativeFingerprint: "" }, { verified: false },
    ]) {
      writeFileSync(file, JSON.stringify({ ...descriptor, ...override }));
      assert.throws(() => internalCheckoutProfile(env), /FORBIDDEN/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
