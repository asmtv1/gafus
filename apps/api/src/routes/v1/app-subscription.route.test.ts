import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelYookassaAppSubscriptionMock,
  getAppSubscriptionAccessMock,
  getAppSubscriptionOfferMock,
  reconcilePendingYookassaAppSubscriptionMock,
  restoreAppleAppSubscriptionMock,
  startYookassaAppSubscriptionPaymentMock,
  verifyAppleAppSubscriptionMock,
} = vi.hoisted(() => ({
  cancelYookassaAppSubscriptionMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  getAppSubscriptionOfferMock: vi.fn(),
  reconcilePendingYookassaAppSubscriptionMock: vi.fn(),
  restoreAppleAppSubscriptionMock: vi.fn(),
  startYookassaAppSubscriptionPaymentMock: vi.fn(),
  verifyAppleAppSubscriptionMock: vi.fn(),
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  cancelYookassaAppSubscription: cancelYookassaAppSubscriptionMock,
  getAppSubscriptionAccess: getAppSubscriptionAccessMock,
  getAppSubscriptionOffer: getAppSubscriptionOfferMock,
  reconcilePendingYookassaAppSubscription: reconcilePendingYookassaAppSubscriptionMock,
  restoreAppleAppSubscription: restoreAppleAppSubscriptionMock,
  startYookassaAppSubscriptionPayment: startYookassaAppSubscriptionPaymentMock,
  SubscriptionRequiredError: class SubscriptionRequiredError extends Error {
    code = "SUBSCRIPTION_REQUIRED" as const;
    status = 402 as const;
  },
  verifyAppleAppSubscription: verifyAppleAppSubscriptionMock,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { jsonRequest } from "../../test/route-test-utils";
import { appSubscriptionRoutes } from "./app-subscription";

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/app-subscription/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/app-subscription", appSubscriptionRoutes);
  return app;
}

describe("app subscription route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps Apple verification domain failures to an HTTP failure envelope", async () => {
    const app = createAuthenticatedTestApp();
    verifyAppleAppSubscriptionMock.mockResolvedValueOnce({
      success: false,
      code: "APPLE_APP_ACCOUNT_TOKEN_REQUIRED",
      error: "Транзакция Apple не принадлежит этому аккаунту",
    });

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/apple/verify", "POST", {
        signedTransactionInfo: "signed-token",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: "APPLE_APP_ACCOUNT_TOKEN_REQUIRED",
      error: "Транзакция Apple не принадлежит этому аккаунту",
    });
  });

  it("returns success only when Apple verification succeeds", async () => {
    const app = createAuthenticatedTestApp();
    verifyAppleAppSubscriptionMock.mockResolvedValueOnce({ success: true });

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/apple/verify", "POST", {
        signedTransactionInfo: "signed-token",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { success: true },
    });
  });
});
