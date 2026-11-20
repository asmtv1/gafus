import { describe, expect, it, vi } from "vitest";
vi.mock("@gafus/prisma", () => ({ prisma: {} }));
import { normalizeOtaControl } from "./appFeatureFlagsService";

describe("mobile OTA release-control validation", () => {
  it("accepts an explicit platform and exact positive OTA revision", () => {
    expect(normalizeOtaControl({
      required: true, version: " 1.7.5-ota.4 ", platform: "ios",
    })).toEqual({ required: true, version: "1.7.5-ota.4", platform: "ios" });
  });
  it("refuses to require an OTA with no published version", () => {
    expect(() => normalizeOtaControl({
      required: true, version: null, platform: "android",
    })).toThrow("Нельзя требовать OTA");
  });
  it("permits optional absent OTA only when required is false", () => {
    for (const platform of ["ios", "android", "all"] as const) {
      expect(normalizeOtaControl({
        required: false, version: "   ", platform,
      })).toEqual({ required: false, version: null, platform });
    }
  });
  it("refuses unsafe versions even when OTA is not required", () => {
    for (const version of [
      "1.7.5-ota.00", "1.7.5-ota.01", "1.7.5-ota.1+debug",
      "1.7.5-ota.1;DROP TABLE", "1.7.5-ota.", "../1.7.5-ota.1",
    ]) {
      expect(() => normalizeOtaControl({
        required: false, version, platform: "android",
      }), version).toThrow();
    }
  });
  it("rejects malformed revisions and forged target platforms", () => {
    for (const version of ["1.7.5-ota.0", "1.7.5", "1.7.5-ota.-1"]) {
      expect(() => normalizeOtaControl({
        required: false, version, platform: "ios",
      })).toThrow("Версия OTA");
    }
    expect(() => normalizeOtaControl({
      required: false, version: null, platform: "windows" as "ios",
    })).toThrow("Недопустимая платформа");
  });
});
