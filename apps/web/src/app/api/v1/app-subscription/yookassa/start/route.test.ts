import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock, startPaymentMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  startPaymentMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  startYookassaAppSubscriptionPayment: startPaymentMock,
}));

import { POST } from "./route";

function request(body: unknown = { planCode: "MONTHLY" }) {
  return new NextRequest("https://gafus.test/api/v1/app-subscription/yookassa/start", {
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      host: "gafus.test",
      "x-forwarded-proto": "https",
    },
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/app-subscription/yookassa/start", () => {
  afterEach(() => {
    delete process.env.WEB_APP_URL;
    delete process.env.YOOKASSA_SECRET_KEY;
    delete process.env.YOOKASSA_SHOP_ID;
  });

  it("requires auth", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
  });

  it("returns config error when YooKassa credentials are missing", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "CONFIG", success: false });
    expect(startPaymentMock).not.toHaveBeenCalled();
  });

  it("starts a payment when auth and config are valid", async () => {
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    process.env.YOOKASSA_SHOP_ID = "shop";
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    startPaymentMock.mockResolvedValueOnce({
      confirmationUrl: "https://pay.test",
      localSubscriptionId: "sub-1",
      success: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { confirmationUrl: "https://pay.test", localSubscriptionId: "sub-1", success: true },
      success: true,
    });
    expect(startPaymentMock).toHaveBeenCalledWith({
      origin: "https://gafus.ru",
      planCode: "MONTHLY",
      secretKey: "secret",
      shopId: "shop",
      userId: "user-1",
    });
  });

  it("requires planCode", async () => {
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    process.env.YOOKASSA_SHOP_ID = "shop";
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      success: false,
    });
    expect(startPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects the removed weekly plan", async () => {
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    process.env.YOOKASSA_SHOP_ID = "shop";
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(request({ planCode: "WEEKLY" }));

    expect(response.status).toBe(400);
    expect(startPaymentMock).not.toHaveBeenCalled();
  });
});
