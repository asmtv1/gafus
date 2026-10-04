import { describe, expect, it } from "vitest";
import { getWorkerSubscriptionRenewalPlan } from "./app-subscription-plan";

describe("immutable subscription renewal agreement", () => {
  it.each([
    ["TWO_WEEKS", 1490, 14], ["MONTHLY", 2490, 30], ["THREE_MONTHS", 6490, 90],
    ["TWO_WEEKS", 1185, 30], ["MONTHLY", 1465, 30], ["THREE_MONTHS", 2470, 30],
  ])("uses %s recorded price %s and period %s", (planCode, price, days) => {
    expect(getWorkerSubscriptionRenewalPlan({ planCode, renewalPriceRub: price,
      renewalIntervalDays: Number(days), renewalCurrency: "RUB" })).toEqual({
      code: planCode, yookassaPriceRub: price, intervalDays: days, currency: "RUB",
    });
  });
  it.each([
    {}, { renewalPriceRub: 0 }, { renewalIntervalDays: 0 },
    { renewalCurrency: "USD" }, { planCode: "UNKNOWN" },
  ])("refuses invalid or missing terms instead of guessing a price", (override) => {
    const terms = Object.keys(override).length ? {
      planCode: "MONTHLY", renewalPriceRub: 2490, renewalIntervalDays: 30, renewalCurrency: "RUB",
      ...override,
    } : { planCode: "MONTHLY" };
    expect(getWorkerSubscriptionRenewalPlan(terms)).toBeNull();
  });
});
