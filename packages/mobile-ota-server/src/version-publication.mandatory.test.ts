import { describe, expect, it } from "vitest";
import { canRequirePublicCheckout, type MandatoryPublicationChoice } from "./version-publication";

const selected: MandatoryPublicationChoice = {
  revision: 5, checkout: true, complete: true,
  publicAppStoreReady: true, nativeIds: ["native-app-store-101"],
  recoveryFor: null, newer: false,
};
const recovery: MandatoryPublicationChoice = {
  revision: 6, checkout: false, complete: true,
  publicAppStoreReady: true, nativeIds: ["native-app-store-101"],
  recoveryFor: 5, newer: true,
};
const ios = { platform: "ios", runtimeVersion: "1.7.5" } as const;

describe("required public iOS OTA with signed YooKassa", () => {
  it("permits exactly the verified iOS 1.7.5 App Store build with its READY same-build recovery", () => {
    expect(canRequirePublicCheckout(ios, selected, [selected, recovery], "true")).toBe(true);
  });
  it("requires explicit production authorization", () => {
    expect(canRequirePublicCheckout(ios, selected, [recovery], undefined)).toBe(false);
    expect(canRequirePublicCheckout(ios, selected, [recovery], "false")).toBe(false);
  });
  it("never changes Android or another iOS runtime", () => {
    expect(canRequirePublicCheckout({ platform: "android", runtimeVersion: "1.7.5" }, selected, [recovery], "true")).toBe(false);
    expect(canRequirePublicCheckout({ platform: "ios", runtimeVersion: "1.7.6" }, selected, [recovery], "true")).toBe(false);
  });
  it("does not permit mandatory checkout when a recovery is missing, incomplete, stale, or cross-build", () => {
    expect(canRequirePublicCheckout(ios, selected, [], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, selected, [{ ...recovery, checkout: true }], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, selected, [{ ...recovery, complete: false }], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, selected, [{ ...recovery, newer: false }], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, selected, [{ ...recovery, recoveryFor: 3 }], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, selected, [{ ...recovery, nativeIds: ["other-native-build"] }], "true")).toBe(false);
  });
  it("rejects invalid current App Store selection or partial releases", () => {
    expect(canRequirePublicCheckout(ios, { ...selected, publicAppStoreReady: false }, [recovery], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, { ...selected, complete: false }, [recovery], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, { ...selected, nativeIds: [] }, [recovery], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, { ...selected, nativeIds: ["native-app-store-101", "native-app-store-101"] }, [recovery], "true")).toBe(false);
  });
});

describe("required public Android RuStore OTA", () => {
  const android = { platform: "android", runtimeVersion: "1.7.5" } as const;
  const target = { ...selected, publicAppStoreReady: false, publicRustoreReady: true, nativeIds: ["rustore-17506"] };
  const rollback = { ...recovery, publicAppStoreReady: false, publicRustoreReady: true, nativeIds: target.nativeIds };
  it("requires exact RuStore recovery and independent approval", () => {
    expect(canRequirePublicCheckout(android, target, [rollback], "true")).toBe(true);
    expect(canRequirePublicCheckout(android, target, [rollback], "false")).toBe(false);
    expect(canRequirePublicCheckout(android, {...target, publicRustoreReady: false}, [rollback], "true")).toBe(false);
    expect(canRequirePublicCheckout(android, target, [recovery], "true")).toBe(false);
    expect(canRequirePublicCheckout(android, target, [], "true")).toBe(false);
    expect(canRequirePublicCheckout({...android, runtimeVersion: "1.7.6"}, target, [rollback], "true")).toBe(false);
    expect(canRequirePublicCheckout(ios, target, [rollback], "true")).toBe(false);
  });
});
