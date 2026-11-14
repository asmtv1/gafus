import { describe, expect, it } from "vitest";
import * as sharedApple from "@gafus/subscription-shared/appleEnvironment";
import * as sharedPayments from "@gafus/subscription-shared/paymentPure";
import * as sharedPlans from "@gafus/subscription-shared/plans";
import * as sharedProfits from "@gafus/subscription-shared/profitMath";
import * as sharedPromo from "@gafus/subscription-shared/promoCode";
import * as legacyApple from "./appleEnvironment";
import * as legacyPayments from "./paymentPure";
import * as legacyPlans from "./plans";
import * as legacyProfits from "./profitMath";
import * as legacyPromo from "./promoCode";

describe("legacy payment-server exports delegate to the same shared pure policies", () => {
  it("preserves exact function identity for all five public compatibility modules", () => {
    expect(legacyApple.resolveAppleEnvironment).toBe(sharedApple.resolveAppleEnvironment);
    expect(legacyPayments.mapAppleServerStatus).toBe(sharedPayments.mapAppleServerStatus);
    expect(legacyPlans.getAppSubscriptionPlanConfig).toBe(sharedPlans.getAppSubscriptionPlanConfig);
    expect(legacyProfits.calculateProfit).toBe(sharedProfits.calculateProfit);
    expect(legacyPromo.calculateAppSubscriptionPromoPrice).toBe(
      sharedPromo.calculateAppSubscriptionPromoPrice,
    );
  });
  it("retains historical plan and promo-code calculation behavior", () => {
    expect(legacyPlans.normalizeAppSubscriptionPlanCode("MONTHLY")).toBe("MONTHLY");
    expect(
      legacyPromo.calculateAppSubscriptionPromoPrice("1000", 25).discountedPrice.toFixed(2),
    ).toBe("750.00");
  });
});
