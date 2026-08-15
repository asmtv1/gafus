import { describe, expect, it } from "vitest";

import {
  getAppSubscriptionPromoCodeErrorState,
  isAppSubscriptionPromoCodeInputValid,
  shouldBlockAppSubscriptionCheckoutForPromo,
} from "./promo-code-ui";

describe("web promo code UI rules", () => {
  it("uses the backend format without making a request while typing", () => {
    expect(isAppSubscriptionPromoCodeInputValid(" kisa_1488-1 ")).toBe(true);
    expect(isAppSubscriptionPromoCodeInputValid("киса")).toBe(false);
    expect(isAppSubscriptionPromoCodeInputValid(" ")).toBe(false);
    expect(isAppSubscriptionPromoCodeInputValid("A".repeat(65))).toBe(false);
  });

  it.each([
    ["PROMO_CODE_INVALID_FORMAT", "invalid-format"],
    ["PROMO_CODE_NOT_FOUND", "not-found"],
    ["PROMO_CODE_INACTIVE", "inactive"],
    ["PROMO_CODE_CHANGED", "changed"],
    ["PROMO_CODE_NOT_ELIGIBLE", "not-eligible"],
    ["PROMO_CODE_FEATURE_DISABLED", "feature-disabled"],
    ["PROMO_CHECKOUT_IN_PROGRESS", "checkout-in-progress"],
    [null, "network-error"],
  ])("maps %s to %s", (code, state) => {
    expect(getAppSubscriptionPromoCodeErrorState(code)).toBe(state);
  });

  it("blocks a non-empty code until the current text has an applied preview", () => {
    expect(shouldBlockAppSubscriptionCheckoutForPromo("", false)).toBe(false);
    expect(shouldBlockAppSubscriptionCheckoutForPromo("   ", false)).toBe(false);
    expect(shouldBlockAppSubscriptionCheckoutForPromo("KISA", false)).toBe(true);
    expect(shouldBlockAppSubscriptionCheckoutForPromo("KISA", true)).toBe(false);
  });
});
