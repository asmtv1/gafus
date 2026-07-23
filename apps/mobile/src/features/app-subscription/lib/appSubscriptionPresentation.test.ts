import { describe, expect, it } from "vitest";

import {
  formatAppSubscriptionPlanPrice,
  getYookassaLegalSuffix,
  getYookassaPaymentCaption,
  getYookassaPrimaryCta,
  selectDefaultAppSubscriptionPlan,
} from "./appSubscriptionPresentation";

const monthlyPlan = {
  code: "MONTHLY" as const,
  title: "Месячный",
  intervalDays: 30,
  yookassaPriceRub: 2500,
  enabled: true,
};

describe("app subscription presentation", () => {
  it("uses immediate-payment copy without a trial", () => {
    expect(getYookassaPrimaryCta()).toBe("Оплатить по СБП");
    expect(getYookassaPaymentCaption()).toBe("Списание произойдёт при оформлении подписки.");
    expect(getYookassaLegalSuffix()).not.toContain("бесплат");
  });

  it("selects and formats the monthly plan", () => {
    expect(selectDefaultAppSubscriptionPlan([monthlyPlan])).toEqual(monthlyPlan);
    expect(formatAppSubscriptionPlanPrice(monthlyPlan)).toBe("2 500 ₽/месяц");
  });
});
