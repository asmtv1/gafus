import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  previewAppSubscriptionPromoCode: mocks.preview,
  AppSubscriptionPromoCodeDomainError: class AppSubscriptionPromoCodeDomainError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://gafus.test/api/v1/app-subscription/promo-code/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/app-subscription/promo-code/preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a session", async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);
    expect((await POST(request({ planCode: "MONTHLY", promoCode: "KISA" }))).status).toBe(401);
  });

  it("returns the shared preview contract", async () => {
    mocks.getServerSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.preview.mockResolvedValueOnce({
      code: "Kisa",
      revision: 3,
      planCode: "MONTHLY",
      discountPercent: 50,
      originalPriceRub: 2500,
      discountedPriceRub: 1250,
      renewalPriceRub: 2500,
      currency: "RUB",
    });
    const response = await POST(request({ planCode: "MONTHLY", promoCode: " Kisa " }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { discountedPriceRub: 1250, renewalPriceRub: 2500 },
    });
    expect(mocks.preview).toHaveBeenCalledWith({
      userId: "user-1",
      planCode: "MONTHLY",
      promoCode: " Kisa ",
    });
  });

  it.each([
    ["PROMO_CODE_INVALID_FORMAT", 400],
    ["PROMO_CODE_NOT_FOUND", 404],
    ["PROMO_CODE_INACTIVE", 409],
    ["PROMO_CODE_NOT_ELIGIBLE", 403],
    ["PROMO_CODE_FEATURE_DISABLED", 403],
  ] as const)("maps domain error %s to HTTP %s", async (code, status) => {
    mocks.getServerSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const PromoError = (await import("@gafus/core/services/appSubscription"))
      .AppSubscriptionPromoCodeDomainError;
    mocks.preview.mockRejectedValueOnce(new PromoError(code, `error:${code}`));

    const response = await POST(request({ planCode: "MONTHLY", promoCode: "KISA" }));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ success: false, code });
  });
});
