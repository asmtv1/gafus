import { describe, expect, it } from "vitest";

import {
  getYookassaLegalSuffix,
  getYookassaPaymentCaption,
  getYookassaPricePillText,
  getYookassaPrimaryCta,
} from "./appSubscriptionPresentation";

describe("app subscription presentation", () => {
  it("shows free trial copy only when YooKassa trial is available", () => {
    const offer = { yookassaTrialAvailable: true, yookassaTrialDays: 3 };

    expect(getYookassaPrimaryCta({ offer })).toBe("Попробовать 3 дня бесплатно");
    expect(getYookassaPricePillText({ offer })).toBe("3 дня бесплатно");
    expect(getYookassaPaymentCaption({ offer })).toBe(
      "Карта привязывается сейчас без списания. Первое списание — через 3 дня.",
    );
    expect(getYookassaLegalSuffix({ offer })).toContain("первые 3 дня бесплатны");
  });

  it("uses paid subscription copy when YooKassa trial is unavailable", () => {
    const offer = { yookassaTrialAvailable: false, yookassaTrialDays: 3 };

    expect(getYookassaPrimaryCta({ offer })).toBe("Оформить подписку");
    expect(getYookassaPricePillText({ offer })).toBeNull();
    expect(getYookassaPaymentCaption({ offer })).toBe(
      "Списание произойдёт при оформлении подписки. Карту можно отвязать в профиле.",
    );
    expect(getYookassaLegalSuffix({ offer })).not.toContain("бесплат");
  });
});
