import { describe, expect, it } from "vitest";

import {
  formatAppSubscriptionPlanPrice,
  getYookassaLegalSuffix,
  getYookassaPaymentCaption,
  getYookassaPricePillText,
  getYookassaPrimaryCta,
  getYookassaTrialLeadText,
  getYookassaTrialUnavailableText,
  selectDefaultAppSubscriptionPlan,
} from "./appSubscriptionPresentation";

describe("app subscription presentation", () => {
  it("shows YooKassa trial copy when trial is available", () => {
    const offer = { yookassaTrialAvailable: true, yookassaTrialDays: 3 };

    expect(getYookassaPrimaryCta({ offer })).toBe("Оформить подписку");
    expect(getYookassaPricePillText({ offer })).toBeNull();
    expect(getYookassaTrialLeadText({ offer })).toBe("3 дня бесплатно, затем");
    expect(getYookassaPaymentCaption({ offer })).toBe(
      "Списание произойдёт после пробного периода. Способ оплаты сохраняется в ЮKassa для автопродления.",
    );
    expect(getYookassaLegalSuffix({ offer })).toContain("3 дня бесплатно");
  });

  it("uses paid subscription copy when YooKassa trial is unavailable", () => {
    const offer = { yookassaTrialAvailable: false, yookassaTrialDays: 3 };

    expect(getYookassaPrimaryCta({ offer })).toBe("Оформить подписку");
    expect(getYookassaPricePillText({ offer })).toBeNull();
    expect(getYookassaTrialLeadText({ offer })).toBeNull();
    expect(getYookassaPaymentCaption({ offer })).toBe(
      "Списание произойдёт при оформлении подписки. Способ оплаты сохраняется в ЮKassa для автопродления.",
    );
    expect(getYookassaLegalSuffix({ offer })).not.toContain("бесплат");
    expect(getYookassaTrialUnavailableText({ offer })).toBeNull();
  });

  it("explains card fingerprint trial reuse", () => {
    const offer = {
      yookassaTrialAvailable: false,
      yookassaTrialDays: 3,
      yookassaTrialUnavailableReason: "CARD_FINGERPRINT_REUSED",
    };

    expect(getYookassaTrialUnavailableText({ offer })).toContain(
      "С этим способом оплаты пробный период уже использован",
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

  it("falls back to the first enabled plan when monthly is absent", () => {
    const plans = [
      { code: "WEEKLY", title: "Недельный", intervalDays: 7, yookassaPriceRub: 200, enabled: true },
    ] as const;

    expect(selectDefaultAppSubscriptionPlan(plans)?.code).toBe("WEEKLY");
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
});
