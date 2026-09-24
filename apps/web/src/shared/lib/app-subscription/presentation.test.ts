import { describe, expect, it } from "vitest";

import {
  formatAppSubscriptionPlanPrice,
  formatAppSubscriptionRubAmount,
  getAppSubscriptionIntervalRenewalText,
  getAppSubscriptionPlanComparisonText,
  getAppSubscriptionPlanPeriodText,
  getAppSubscriptionPromoPricePresentation,
  getAppSubscriptionPlanBadgeText,
  getAppSubscriptionPlanSavingsText,
  getYookassaLegalText,
  getYookassaPriceNote,
  getYookassaPrimaryCta,
  getYookassaReturnSuccessTitle,
  selectDefaultAppSubscriptionPlan,
  sortYookassaSubscriptionPlans,
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
    expect(getYookassaPrimaryCta("2 490 ₽")).toBe("Оплатить 2 490 ₽ по СБП или картой");
    expect(getYookassaPriceNote()).toBe("Автопродление по тарифу");
    expect(getYookassaReturnSuccessTitle()).toBe("Premium подключён");
    expect(getYookassaLegalText("2 500 ₽", "2 500 ₽/месяц")).toContain(
      "сейчас спишется 2 500 ₽",
    );
    expect(getYookassaLegalText("2 500 ₽", "2 500 ₽/месяц")).toContain(
      "автоматически по цене 2 500 ₽/месяц",
    );
    expect(getYookassaLegalText("2 500 ₽", "2 500 ₽/месяц")).not.toContain("бесплат");
  });

  it("selects and formats the monthly plan", () => {
    expect(selectDefaultAppSubscriptionPlan([monthlyPlan])).toEqual(monthlyPlan);
    expect(formatAppSubscriptionPlanPrice(monthlyPlan)).toBe("2 500 ₽/месяц");
    expect(getAppSubscriptionPlanPeriodText(monthlyPlan)).toBe("Оплата каждые 30 дней");
    expect(getAppSubscriptionPlanComparisonText(monthlyPlan)).toBe("≈ 583 ₽ в неделю");
  });

  it.each([
    {
      discountPercent: 1,
      originalPriceRub: 2500,
      discountedPriceRub: 2475,
      expectedPrice: "2 475 ₽",
      expectedChip: "−1%",
    },
    {
      discountPercent: 50,
      originalPriceRub: 2500,
      discountedPriceRub: 1250,
      expectedPrice: "1 250 ₽",
      expectedChip: "−50%",
    },
  ])("presents a $discountPercent% backend promo preview", (preview) => {
    const presentation = getAppSubscriptionPromoPricePresentation({
      ...preview,
      renewalPriceRub: 2500,
      intervalDays: 30,
    });

    expect(presentation).toEqual({
      currentChargeText: `Сейчас спишется ${preview.expectedPrice}`,
      discountChipText: preview.expectedChip,
      nextRenewalText: "Следующее списание через 30 дней — 2 500 ₽",
      ongoingRenewalText: "Далее 2 500 ₽ каждые 30 дней",
    });
    expect(
      getYookassaLegalText(
        formatAppSubscriptionRubAmount(preview.discountedPriceRub),
        `${formatAppSubscriptionRubAmount(2500)}/месяц`,
      ),
    ).toContain(`сейчас спишется ${preview.expectedPrice}`);
  });

  it("formats multi-period renewals without month wording", () => {
    expect(formatAppSubscriptionPlanPrice({ ...monthlyPlan, intervalDays: 14 })).toBe(
      "2 500 ₽/14 дней",
    );
    expect(formatAppSubscriptionPlanPrice({ ...monthlyPlan, intervalDays: 90 })).toBe(
      "2 500 ₽/90 дней",
    );
    expect(getAppSubscriptionIntervalRenewalText(90)).toBe("через 90 дней");
  });

  it("orders multi-period plans, keeps monthly selected and presents only positive savings", () => {
    const plans = [
      { ...monthlyPlan, code: "THREE_MONTHS" as const, intervalDays: 90, badge: "MAX_SAVINGS" as const, savingsRub: 2500 },
      { ...monthlyPlan, code: "TWO_WEEKS" as const, intervalDays: 14, badge: "TRY" as const, savingsRub: null },
      { ...monthlyPlan, code: "MONTHLY" as const, badge: "POPULAR" as const, savingsRub: 500 },
    ];

    expect(sortYookassaSubscriptionPlans(plans).map((plan) => plan.code)).toEqual([
      "TWO_WEEKS",
      "MONTHLY",
      "THREE_MONTHS",
    ]);
    expect(selectDefaultAppSubscriptionPlan(plans)?.code).toBe("MONTHLY");
    expect(getAppSubscriptionPlanBadgeText("MAX_SAVINGS")).toBe("Максимальная экономия");
    expect(getAppSubscriptionPlanSavingsText(500)).toBe("Экономия 500 ₽");
    expect(getAppSubscriptionPlanSavingsText(0)).toBeNull();
  });
});
