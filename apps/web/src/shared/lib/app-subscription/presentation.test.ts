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

describe("web app subscription presentation", () => {
  it("shows the three-day trial before the selected YooKassa tariff", () => {
    const offer = { yookassaTrialAvailable: true, yookassaTrialDays: 3 };

    expect(getYookassaPrimaryCta(offer)).toBe("Начать бесплатно");
    expect(getYookassaPriceNote(offer)).toBe("Первые 3 дня бесплатно");
    expect(getYookassaReturnSuccessTitle(offer)).toBe("Пробный период активирован");
    expect(getYookassaLegalText(offer, "1 100 ₽/месяц")).toContain(
      "первое списание произойдёт через 3 дня",
    );
    expect(getYookassaLegalText(offer, "1 100 ₽/месяц")).toContain("бесплат");
  });

  it("uses paid copy after the YooKassa trial has already been used", () => {
    const offer = { yookassaTrialAvailable: false, yookassaTrialDays: 3 };

    expect(getYookassaPrimaryCta(offer)).toBe("Оформить подписку");
    expect(getYookassaPriceNote(offer)).toBe("Автопродление по тарифу");
    expect(getYookassaReturnSuccessTitle(offer)).toBe("Premium подключён");
    expect(getYookassaLegalText(offer, "1 100 ₽/месяц")).toContain(
      "списание произойдёт при оформлении подписки",
    );
  });

  it("selects monthly by default when both plans are enabled", () => {
    const plans = [
      { code: "WEEKLY", title: "Недельный", intervalDays: 7, yookassaPriceRub: 200, enabled: true },
      {
        code: "MONTHLY",
        title: "Месячный",
        intervalDays: 30,
        yookassaPriceRub: 1100,
        enabled: true,
      },
    ] as const;

    expect(selectDefaultAppSubscriptionPlan(plans)?.code).toBe("MONTHLY");
  });

  it("formats weekly and monthly plan prices", () => {
    expect(
      formatAppSubscriptionPlanPrice({
        code: "WEEKLY",
        title: "Недельный",
        intervalDays: 7,
        yookassaPriceRub: 200,
        enabled: true,
      }),
    ).toBe("200 ₽/неделю");
    expect(
      formatAppSubscriptionPlanPrice({
        code: "MONTHLY",
        title: "Месячный",
        intervalDays: 30,
        yookassaPriceRub: 1100,
        enabled: true,
      }),
    ).toBe("1 100 ₽/месяц");
  });

  it("explains plan periods and normalized price comparison", () => {
    expect(
      getAppSubscriptionPlanPeriodText({
        code: "WEEKLY",
        title: "Недельный",
        intervalDays: 7,
        yookassaPriceRub: 200,
        enabled: true,
      }),
    ).toBe("Оплата каждые 7 дней");
    expect(
      getAppSubscriptionPlanPeriodText({
        code: "MONTHLY",
        title: "Месячный",
        intervalDays: 30,
        yookassaPriceRub: 1100,
        enabled: true,
      }),
    ).toBe("Оплата каждые 30 дней");

    expect(
      getAppSubscriptionPlanComparisonText({
        code: "WEEKLY",
        title: "Недельный",
        intervalDays: 7,
        yookassaPriceRub: 200,
        enabled: true,
      }),
    ).toBe("≈ 857 ₽ за 30 дней");
    expect(
      getAppSubscriptionPlanComparisonText({
        code: "MONTHLY",
        title: "Месячный",
        intervalDays: 30,
        yookassaPriceRub: 1100,
        enabled: true,
      }),
    ).toBe("≈ 257 ₽ в неделю");
  });
});
