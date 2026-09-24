import { describe, expect, it } from "vitest";

import {
  formatAppSubscriptionPlanPrice,
  formatPlanPeriod,
  formatSavingsRub,
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

const twoWeeksPlan = {
  code: "TWO_WEEKS" as const,
  title: "Две недели",
  intervalDays: 14,
  yookassaPriceRub: 1490,
  enabled: true,
};

const threeMonthsPlan = {
  code: "THREE_MONTHS" as const,
  title: "Три месяца",
  intervalDays: 90,
  yookassaPriceRub: 6490,
  enabled: true,
};

describe("app subscription presentation", () => {
  it("uses immediate-payment copy without a trial", () => {
    expect(getYookassaPrimaryCta(1490)).toBe("Оплатить 1 490 ₽ по СБП или картой");
    expect(getYookassaPaymentCaption()).toBe("Списание произойдёт при оформлении подписки.");
    expect(getYookassaLegalSuffix()).not.toContain("бесплат");
  });

  it("selects and formats the monthly plan", () => {
    expect(selectDefaultAppSubscriptionPlan([twoWeeksPlan, monthlyPlan, threeMonthsPlan])).toEqual(monthlyPlan);
    expect(formatAppSubscriptionPlanPrice(monthlyPlan)).toBe("2 500 ₽/месяц");
    expect(formatAppSubscriptionPlanPrice(threeMonthsPlan)).toBe("6 490 ₽/90 дней");
    expect(formatPlanPeriod(14)).toBe("14 дней");
    expect(formatSavingsRub(2500)).toBe("Экономия 2 500 ₽");
    expect(formatSavingsRub(0)).toBeNull();
  });
});
