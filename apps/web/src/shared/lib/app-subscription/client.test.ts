import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppSubscriptionApiError,
  previewAppSubscriptionPromoCode,
  startAppSubscriptionYookassaPayment,
} from "./client";

describe("web app subscription client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the promo preview only when explicitly requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            code: "Kisa",
            revision: 3,
            planCode: "MONTHLY",
            discountPercent: 50,
            originalPriceRub: 2500,
            discountedPriceRub: 1250,
            renewalPriceRub: 2500,
            intervalDays: 30,
            currency: "RUB",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      previewAppSubscriptionPromoCode({
        planCode: "MONTHLY",
        promoCode: " Kisa ",
        csrfToken: "csrf-token",
      }),
    ).resolves.toMatchObject({ code: "Kisa", revision: 3, discountedPriceRub: 1250 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/app-subscription/promo-code/preview",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": "csrf-token",
        },
        body: JSON.stringify({ planCode: "MONTHLY", promoCode: " Kisa " }),
      }),
    );
  });

  it("sends the selected three-month plan in the checkout payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { confirmationUrl: "https://pay.test", localSubscriptionId: "sub-90" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startAppSubscriptionYookassaPayment({
      planCode: "THREE_MONTHS",
      csrfToken: "csrf-token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/app-subscription/yookassa/start",
      expect.objectContaining({ body: JSON.stringify({ planCode: "THREE_MONTHS" }) }),
    );
  });

  it("includes only the applied code snapshot in the payment start body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { confirmationUrl: "https://pay.test", localSubscriptionId: "sub-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startAppSubscriptionYookassaPayment({
      planCode: "MONTHLY",
      csrfToken: "csrf-token",
      promoCode: { code: "Kisa", revision: 3 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/app-subscription/yookassa/start",
      expect.objectContaining({
        body: JSON.stringify({
          planCode: "MONTHLY",
          promoCode: { code: "Kisa", revision: 3 },
        }),
      }),
    );
  });

  it("keeps ordinary payment start backward compatible", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { confirmationUrl: "https://pay.test", localSubscriptionId: "sub-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startAppSubscriptionYookassaPayment({
      planCode: "MONTHLY",
      csrfToken: "csrf-token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/app-subscription/yookassa/start",
      expect.objectContaining({ body: JSON.stringify({ planCode: "MONTHLY" }) }),
    );
  });

  it("preserves backend promo error codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            code: "PROMO_CODE_CHANGED",
            error: "Промокод изменился",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const error = await startAppSubscriptionYookassaPayment({
      planCode: "MONTHLY",
      csrfToken: "csrf-token",
      promoCode: { code: "Kisa", revision: 3 },
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(AppSubscriptionApiError);
    expect(error).toMatchObject({ code: "PROMO_CODE_CHANGED", status: 409 });
  });
});
