import { describe, expect, it } from "vitest";

import { selectGooglePlayPurchaseTokens } from "./googlePlayPurchaseTokens";

const plans = [{ productId: "gafus_premium" }];

describe("Google Play restoration token selection", () => {
  it("restores tokens without an exposed obfuscated account ID for server verification", () => {
    expect(selectGooglePlayPurchaseTokens(
      [{ store: "google", productId: "gafus_premium", purchaseToken: "restored" }],
      plans, "account-A",
    )).toEqual(["restored"]);
  });

  it("rejects a different client account, another product or store, and empty tokens", () => {
    expect(selectGooglePlayPurchaseTokens([
      { store: "google", productId: "gafus_premium", purchaseToken: "other", obfuscatedAccountIdAndroid: "account-B" },
      { store: "google", productId: "other", purchaseToken: "wrong-product" },
      { store: "apple", productId: "gafus_premium", purchaseToken: "wrong-store" },
      { store: "google", productId: "gafus_premium", purchaseToken: "" },
      { store: "google", productId: "gafus_premium", purchaseToken: "mine", obfuscatedAccountIdAndroid: "account-A" },
      { store: "google", productId: "gafus_premium", purchaseToken: "mine", obfuscatedAccountIdAndroid: "account-A" },
    ], plans, "account-A")).toEqual(["mine"]);
    expect(selectGooglePlayPurchaseTokens(
      [{ store: "google", productId: "gafus_premium", purchaseToken: "token" }],
      plans, "",
    )).toEqual([]);
  });
});
