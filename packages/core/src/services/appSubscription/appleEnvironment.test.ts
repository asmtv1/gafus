import { describe, expect, it } from "vitest";
import { Environment } from "@apple/app-store-server-library";
import { resolveAppleEnvironment } from "./appleEnvironment";

describe("Apple IAP signer and API trust environment (pure)", () => {
  it("refuses to create any verifier/client without a nonempty bundle ID", () => {
    expect(resolveAppleEnvironment({ useSandboxRaw: "true" })).toMatchObject({
      ok: false, code: "CONFIG_APPLE_IAP", message: "APPLE_BUNDLE_ID не задан",
    });
    expect(resolveAppleEnvironment({ bundleIdRaw: "   ", useSandboxRaw: "1" }).ok).toBe(false);
  });
  it.each(["1", "true", "TRUE"])("accepts explicit sandbox mode %s without Apple app ID", value => {
    expect(resolveAppleEnvironment({ bundleIdRaw: " ru.gafus.app ", useSandboxRaw: value })).toEqual({
      ok: true, bundleId: "ru.gafus.app", environment: Environment.SANDBOX,
      appAppleId: undefined,
    });
  });
  it("requires app ID when production is selected, even with an empty flag", () => {
    expect(resolveAppleEnvironment({ bundleIdRaw: "ru.gafus.app" })).toMatchObject({
      ok: false, code: "CONFIG_APPLE_IAP",
      message: "Для production требуется APPLE_APP_ID",
    });
    expect(resolveAppleEnvironment({ bundleIdRaw: "ru.gafus.app", useSandboxRaw: "false" }).ok)
      .toBe(false);
  });
  it("keeps the same exact numeric app identity for verifier and API", () => {
    expect(resolveAppleEnvironment({ bundleIdRaw: "ru.gafus.app", appIdRaw: " 0123456789 " })).toEqual({
      ok: true, bundleId: "ru.gafus.app", environment: Environment.PRODUCTION,
      appAppleId: 123456789,
    });
  });
  it.each([
    "0", "-123", "+123", "1.5", "123abc", "1e5", "123\n666", "NaN", "Infinity",
    "9007199254740992", "9999999999999999999999999999999999999",
  ])("fails closed on invalid or partially parsed APPLE_APP_ID=%s", appIdRaw => {
    expect(resolveAppleEnvironment({ bundleIdRaw: "ru.gafus.app", appIdRaw })).toEqual({
      ok: false, code: "CONFIG_APPLE_IAP", message: "Некорректный APPLE_APP_ID",
    });
  });
  it("also rejects malformed IDs in sandbox, never silently changes the trust target", () => {
    expect(resolveAppleEnvironment({ bundleIdRaw: "ru.gafus.app",
      useSandboxRaw: "1", appIdRaw: "123notanid" }).ok).toBe(false);
  });
});
