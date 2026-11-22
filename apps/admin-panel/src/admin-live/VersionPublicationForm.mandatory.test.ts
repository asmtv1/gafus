import { describe, expect, it } from "vitest";
import { hasSignedPublicCheckoutRecovery } from "./VersionPublicationForm";

type Choice = Parameters<typeof hasSignedPublicCheckoutRecovery>[0];
const choice: Choice = {
  key: "revision-5", revision: 5, title: "Promo OTA", compatible: 1, excluded: 6,
  complete: true, tested: true, newer: false, expanded: false, checkout: true,
  nativeIds: ["app-store-101"], recoveryFor: null, publicAppStoreReady: true,
};
const rollback: Choice = {
  ...choice, key: "revision-6", revision: 6, checkout: false, recoveryFor: 5, newer: true,
};
describe("admin mandatory action for public checkout", () => {
  it("is selectable when the approved release has same-native signed recovery", () => {
    expect(hasSignedPublicCheckoutRecovery(choice, [choice, rollback])).toBe(true);
  });
  it("disables action with missing, wrong or unverified rollback", () => {
    expect(hasSignedPublicCheckoutRecovery(choice, [choice])).toBe(false);
    expect(hasSignedPublicCheckoutRecovery(choice, [{ ...rollback, nativeIds: ["another-build"] }])).toBe(false);
    expect(hasSignedPublicCheckoutRecovery(choice, [{ ...rollback, complete: false }])).toBe(false);
    expect(hasSignedPublicCheckoutRecovery(choice, [{ ...rollback, newer: false }])).toBe(false);
    expect(hasSignedPublicCheckoutRecovery(choice, [{ ...rollback, checkout: true }])).toBe(false);
    expect(hasSignedPublicCheckoutRecovery({ ...choice, publicAppStoreReady: false }, [rollback])).toBe(false);
  });
});
