import { describe, it, expect, vi } from "vitest";
vi.mock("@gafus/prisma", () => ({prisma: {}}));
import { supportsMandatoryOta, parseMandatoryVersion, MandatoryControlError } from "./mandatory-control";
import { resolveMandatoryOtaPolicy } from "./mandatory-policy";

describe("independent mandatory OTA 1.7.5+", () => {
  it("excludes old runtime and accepts current or future native versions", () => {
    for (const runtime of ["1.7.4", "1.6.9", "0.99.9", "1.7.0", "1.7.04", "invalid", "1.7.5-ota.1", "9007199254740992.8.0"])
      expect(supportsMandatoryOta(runtime), runtime).toBe(false);
    for (const runtime of ["1.7.5", "1.7.6", "1.8.0", "2.0.0", "12.2.3"])
      expect(supportsMandatoryOta(runtime), runtime).toBe(true);
  });
  it("requires exact runtime, sane revision and never allows missing mandatory version", () => {
    expect(parseMandatoryVersion("1.7.5", "1.7.5-ota.7", true)).toBe(7);
    expect(parseMandatoryVersion("1.7.6", "1.7.6-ota.1", true)).toBe(1);
    expect(parseMandatoryVersion("1.7.5", null, false)).toBeNull();
    for (const version of ["1.7.4-ota.7", "1.7.6-ota.2", "1.7.5-ota.0", "1.7.5-ota.9007199254740992", "bad"])
      expect(() => parseMandatoryVersion("1.7.5", version, true), version).toThrow(MandatoryControlError);
    expect(() => parseMandatoryVersion("1.7.5", null, true)).toThrow(MandatoryControlError);
    expect(() => parseMandatoryVersion("1.7.4", "1.7.4-ota.2", true)).toThrow(MandatoryControlError);
  });
  it("iOS threshold cannot force Android and vice versa, even with same runtime", () => {
    const ios = {required:true,version:"1.7.5-ota.2",platform:"ios" as const,channel:"production"};
    const android = {required:true,version:"1.7.5-ota.6",platform:"android" as const,channel:"production"};
    const selection = { runtimeVersion:"1.7.5", selectedRevision:6 };
    expect(resolveMandatoryOtaPolicy(ios,{...selection,platform:"ios"}).required).toBe(true);
    expect(resolveMandatoryOtaPolicy(ios,{...selection,platform:"android"}).required).toBe(false);
    expect(resolveMandatoryOtaPolicy(android,{...selection,platform:"android"}).required).toBe(true);
    expect(resolveMandatoryOtaPolicy(android,{...selection,platform:"ios"}).required).toBe(false);
    expect(resolveMandatoryOtaPolicy(ios,{...selection,platform:"ios",selectedRevision:1}).required).toBe(false);
    expect(resolveMandatoryOtaPolicy(ios,{...selection,platform:"ios",selectedRevision:null}).required).toBe(false);
    expect(resolveMandatoryOtaPolicy(ios,{...selection,platform:"ios",runtimeVersion:"1.7.4"}).required).toBe(false);
  });
});
