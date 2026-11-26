import { describe, expect, it } from "vitest";
import { canRequirePublicCheckoutFromPreview, hasSignedPublicCheckoutRecovery } from "./VersionPublicationForm";

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
  it("sees recovery from the full registry preview even though the release dropdown hides it", () => {
    const preview: NonNullable<Parameters<typeof canRequirePublicCheckoutFromPreview>[1]> = {
      total: 7, verified: 1, token: "immutable-review-token",
      active: { revision: 5, title: "Promo OTA", public: true, required: false,
        action: "ALL", key: choice.key, nativeIds: choice.nativeIds },
      choices: [choice, rollback],
    };
    // The release dropdown intentionally filters out all recoveryFor!=null entries.
    const dropdown = preview.choices.filter(c=>c.recoveryFor===null);
    expect(dropdown).toHaveLength(1);
    expect(canRequirePublicCheckoutFromPreview(choice, preview, "ios", "1.7.5")).toBe(true);
    expect(canRequirePublicCheckoutFromPreview(choice, {...preview,choices:dropdown}, "ios", "1.7.5")).toBe(false);
    expect(canRequirePublicCheckoutFromPreview(choice, preview, "android", "1.7.5")).toBe(false);
    expect(canRequirePublicCheckoutFromPreview(choice, preview, "ios", "1.7.6")).toBe(false);
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

it("permits Android RuStore only with a signed matching recovery", () => {
  const target = { ...choice, publicAppStoreReady: false, publicRustoreReady: true, nativeIds: ["rustore-17506"] };
  const recovery = { ...rollback, publicAppStoreReady: false, publicRustoreReady: true, nativeIds: target.nativeIds };
  const preview = { total: 6, verified: 1, token: "review", active: null, choices: [target, recovery] };
  expect(canRequirePublicCheckoutFromPreview(target, preview, "android", "1.7.5")).toBe(true);
  expect(canRequirePublicCheckoutFromPreview(target, preview, "android", "1.7.6")).toBe(false);
  expect(canRequirePublicCheckoutFromPreview(target, preview, "ios", "1.7.5")).toBe(false);
  expect(canRequirePublicCheckoutFromPreview(target, {...preview, choices: [target]}, "android", "1.7.5")).toBe(false);
  expect(canRequirePublicCheckoutFromPreview({...target, publicRustoreReady: false}, preview, "android", "1.7.5")).toBe(false);
});
