import { describe, expect, it } from "vitest";

import {
  formatAppSubscriptionPlanPrice,
  getAppSubscriptionPlanComparisonText,
  getAppSubscriptionPlanPeriodText,
  getYookassaLegalText,
  getYookassaPriceNote,
  getYookassaPrimaryCta,
  getYookassaReturnSuccessTitle,
  selectDefaultAppSubscriptionPlan,
} from "./presentation";

const monthlyPlan = {
  code: "MONTHLY" as const,
  title: "Месячный",
  intervalDays: 30,
  yookassaPriceRub: 2500,
  enabled: true,
};

describe("web app subscription presentation", () => {
  it("uses immediate-payment copy without a trial", () => {
    expect(getYookassaPrimaryCta()).toBe("Оформить подписку");
    expect(getYookassaPriceNote()).toBe("Автопродление по тарифу");
    expect(getYookassaReturnSuccessTitle()).toBe("Premium подключён");
    expect(getYookassaLegalText("2 500 ₽/месяц")).toContain(
      "списание произойдёт при оформлении подписки",
    );
    expect(getYookassaLegalText("2 500 ₽/месяц")).not.toContain("бесплат");
  });

  it("selects and formats the monthly plan", () => {
    expect(selectDefaultAppSubscriptionPlan([monthlyPlan])).toEqual(monthlyPlan);
    expect(formatAppSubscriptionPlanPrice(monthlyPlan)).toBe("2 500 ₽/месяц");
    expect(getAppSubscriptionPlanPeriodText(monthlyPlan)).toBe("Оплата каждые 30 дней");
    expect(getAppSubscriptionPlanComparisonText(monthlyPlan)).toBe("≈ 583 ₽ в неделю");
  });
});
