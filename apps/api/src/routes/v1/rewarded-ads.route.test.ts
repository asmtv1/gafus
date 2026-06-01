import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRewardedAdSessionMock,
  getRewardedCreditsStatusMock,
  grantRewardedCreditsMock,
  recordRewardedAdEventMock,
} = vi.hoisted(() => ({
  createRewardedAdSessionMock: vi.fn(),
  getRewardedCreditsStatusMock: vi.fn(),
  grantRewardedCreditsMock: vi.fn(),
  recordRewardedAdEventMock: vi.fn(),
}));

vi.mock("@gafus/core/services/rewardedCredits", () => ({
  createRewardedAdSession: createRewardedAdSessionMock,
  getRewardedCreditsStatus: getRewardedCreditsStatusMock,
  grantRewardedCredits: grantRewardedCreditsMock,
  recordRewardedAdEvent: recordRewardedAdEventMock,
  RewardedAdSessionError: class RewardedAdSessionError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
  RewardedAdsDisabledError: class RewardedAdsDisabledError extends Error {
    code = "REWARDED_ADS_DISABLED" as const;
  },
  RewardedBalanceFullError: class RewardedBalanceFullError extends Error {
    code = "REWARDED_BALANCE_FULL" as const;
  },
  RewardedDailyLimitReachedError: class RewardedDailyLimitReachedError extends Error {
    code = "REWARDED_DAILY_LIMIT_REACHED" as const;
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { jsonRequest } from "../../test/route-test-utils";
import { rewardedAdsRoutes } from "./rewarded-ads";

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/rewarded-ads/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/rewarded-ads", rewardedAdsRoutes);
  return app;
}

describe("rewarded ads routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mobile rewarded status for the authenticated user", async () => {
    const app = createAuthenticatedTestApp();
    getRewardedCreditsStatusMock.mockResolvedValueOnce({ wallet: { balance: 0 } });

    const response = await app.request("/api/v1/rewarded-ads/status?platform=ANDROID");

    expect(response.status).toBe(200);
    expect(getRewardedCreditsStatusMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "ANDROID",
      target: undefined,
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { wallet: { balance: 0 } },
    });
  });

  it("rejects web platforms on the mobile Hono API", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request("/api/v1/rewarded-ads/status?platform=WEB_DESKTOP");

    expect(response.status).toBe(400);
    expect(getRewardedCreditsStatusMock).not.toHaveBeenCalled();
  });

  it("creates a session and grants without accepting client amount", async () => {
    const app = createAuthenticatedTestApp();
    createRewardedAdSessionMock.mockResolvedValueOnce({ sessionId: "s1", requestNonce: "n1" });
    grantRewardedCreditsMock.mockResolvedValueOnce({ grantedCredits: 5, balance: 5 });

    const sessionResponse = await app.request(
      jsonRequest("/api/v1/rewarded-ads/session", "POST", { platform: "ANDROID" }),
    );
    expect(sessionResponse.status).toBe(200);
    expect(createRewardedAdSessionMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "ANDROID",
      target: undefined,
    });

    const grantResponse = await app.request(
      jsonRequest("/api/v1/rewarded-ads/grant", "POST", {
        sessionId: "s1",
        requestNonce: "n1",
        amount: 999,
      }),
    );

    expect(grantResponse.status).toBe(200);
    expect(grantRewardedCreditsMock).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "s1",
      requestNonce: "n1",
      providerPayload: undefined,
    });
  });

  it("records events without granting credits", async () => {
    const app = createAuthenticatedTestApp();
    recordRewardedAdEventMock.mockResolvedValueOnce(undefined);

    const response = await app.request(
      jsonRequest("/api/v1/rewarded-ads/events", "POST", {
        sessionId: "s1",
        eventType: "REWARDED",
      }),
    );

    expect(response.status).toBe(200);
    expect(recordRewardedAdEventMock).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "s1",
      eventType: "REWARDED",
      payload: undefined,
    });
    expect(grantRewardedCreditsMock).not.toHaveBeenCalled();
  });
});
