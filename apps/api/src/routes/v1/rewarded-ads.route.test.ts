import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRewardedAdSessionMock,
  getRewardedAdStatusMock,
  grantRewardedTargetAccessMock,
  recordRewardedAdEventMock,
  RewardedDailyLimitReachedErrorMock,
} = vi.hoisted(() => ({
  createRewardedAdSessionMock: vi.fn(),
  getRewardedAdStatusMock: vi.fn(),
  grantRewardedTargetAccessMock: vi.fn(),
  recordRewardedAdEventMock: vi.fn(),
  RewardedDailyLimitReachedErrorMock: class RewardedDailyLimitReachedError extends Error {
    code = "REWARDED_DAILY_LIMIT_REACHED" as const;
  },
}));

vi.mock("@gafus/core/services/rewardedCredits", () => ({
  createRewardedAdSession: createRewardedAdSessionMock,
  getRewardedAdStatus: getRewardedAdStatusMock,
  grantRewardedTargetAccess: grantRewardedTargetAccessMock,
  recordRewardedAdEvent: recordRewardedAdEventMock,
  RewardedAdSessionError: class RewardedAdSessionError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  RewardedAdsDisabledError: class RewardedAdsDisabledError extends Error {
    code = "REWARDED_ADS_DISABLED" as const;
  },
  RewardedDailyLimitReachedError: RewardedDailyLimitReachedErrorMock,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { jsonRequest } from "../../test/route-test-utils";
import { rewardedAdsRoutes } from "./rewarded-ads";

const MOBILE_HEADERS = {
  "x-client-platform": "android",
  "x-client-version": "1.6.6",
};
const ARTICLE_TARGET = { targetType: "ARTICLE", targetId: "article-1" } as const;

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
  beforeEach(() => vi.clearAllMocks());

  it("returns direct-access status for a supported mobile client", async () => {
    const app = createAuthenticatedTestApp();
    getRewardedAdStatusMock.mockResolvedValueOnce({ canWatchAd: true });

    const response = await app.request(
      "/api/v1/rewarded-ads/status?platform=ANDROID&targetType=ARTICLE&targetId=article-1",
      { headers: MOBILE_HEADERS },
    );

    expect(response.status).toBe(200);
    expect(getRewardedAdStatusMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "ANDROID",
      target: ARTICLE_TARGET,
      clientContext: { platform: "android", version: "1.6.6" },
    });
  });

  it("requires a concrete article or regular course step target", async () => {
    const app = createAuthenticatedTestApp();
    const missingTarget = await app.request("/api/v1/rewarded-ads/status?platform=ANDROID", {
      headers: MOBILE_HEADERS,
    });
    const dailyTarget = await app.request(
      "/api/v1/rewarded-ads/status?platform=ANDROID&targetType=DAILY_COURSE_STEP&targetId=daily-1",
      { headers: MOBILE_HEADERS },
    );

    expect(missingTarget.status).toBe(400);
    expect(dailyTarget.status).toBe(400);
    expect(getRewardedAdStatusMock).not.toHaveBeenCalled();
  });

  it("rejects web, mismatched platform and old clients", async () => {
    const app = createAuthenticatedTestApp();
    const url =
      "/api/v1/rewarded-ads/status?platform=ANDROID&targetType=ARTICLE&targetId=article-1";
    const web = await app.request(url);
    const mismatched = await app.request(url, {
      headers: { "x-client-platform": "ios", "x-client-version": "1.6.6" },
    });
    const old = await app.request(url, {
      headers: { "x-client-platform": "android", "x-client-version": "1.6.6" },
    });

    expect(web.status).toBe(400);
    expect(mismatched.status).toBe(400);
    expect(old.status).toBe(426);
    expect(getRewardedAdStatusMock).not.toHaveBeenCalled();
  });

  it("creates a targeted session and grants seven-day access", async () => {
    const app = createAuthenticatedTestApp();
    createRewardedAdSessionMock.mockResolvedValueOnce({ sessionId: "s1", requestNonce: "n1" });
    grantRewardedTargetAccessMock.mockResolvedValueOnce({
      accessId: "a1",
      ...ARTICLE_TARGET,
      expiresAt: "2026-08-12T12:00:00.000Z",
      replay: false,
    });

    const sessionResponse = await app.request(
      jsonRequest(
        "/api/v1/rewarded-ads/session",
        "POST",
        { platform: "ANDROID", ...ARTICLE_TARGET },
        MOBILE_HEADERS,
      ),
    );
    expect(sessionResponse.status).toBe(200);
    expect(createRewardedAdSessionMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "ANDROID",
      target: ARTICLE_TARGET,
      clientContext: { platform: "android", version: "1.6.6" },
    });

    const grantResponse = await app.request(
      jsonRequest(
        "/api/v1/rewarded-ads/grant",
        "POST",
        { sessionId: "s1", requestNonce: "n1", amount: 999 },
        MOBILE_HEADERS,
      ),
    );
    expect(grantResponse.status).toBe(200);
    expect(grantRewardedTargetAccessMock).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "s1",
      requestNonce: "n1",
      providerPayload: undefined,
    });
  });

  it("records lifecycle events without granting access", async () => {
    const app = createAuthenticatedTestApp();
    recordRewardedAdEventMock.mockResolvedValueOnce(undefined);

    const response = await app.request(
      jsonRequest(
        "/api/v1/rewarded-ads/events",
        "POST",
        { sessionId: "s1", eventType: "REWARDED" },
        MOBILE_HEADERS,
      ),
    );

    expect(response.status).toBe(200);
    expect(recordRewardedAdEventMock).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "s1",
      eventType: "REWARDED",
      payload: undefined,
    });
    expect(grantRewardedTargetAccessMock).not.toHaveBeenCalled();
  });

  it.each([
    ["session", createRewardedAdSessionMock, { platform: "ANDROID", ...ARTICLE_TARGET }],
    ["events", recordRewardedAdEventMock, { sessionId: "s1", eventType: "REWARDED" }],
  ] as const)("maps daily limit errors from /%s to stable HTTP 402", async (path, mock, body) => {
    const app = createAuthenticatedTestApp();
    mock.mockRejectedValueOnce(new RewardedDailyLimitReachedErrorMock("limit reached"));

    const response = await app.request(
      jsonRequest(`/api/v1/rewarded-ads/${path}`, "POST", body, MOBILE_HEADERS),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "REWARDED_DAILY_LIMIT_REACHED",
    });
  });
});
