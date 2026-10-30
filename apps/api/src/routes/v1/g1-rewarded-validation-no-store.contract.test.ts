/** AG1-ECON-060: validation rejects before route handler must still be private. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ status: vi.fn(), session: vi.fn(), event: vi.fn(), grant: vi.fn() }));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  getRewardedAdStatus: m.status,
  createRewardedAdSession: m.session,
  recordRewardedAdEvent: m.event,
  grantRewardedTargetAccess: m.grant,
  RewardedAdSessionError: class extends Error {},
  RewardedAdsDisabledError: class extends Error {},
  RewardedDailyLimitReachedError: class extends Error {},
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));
vi.mock("../../lib/client-app-context.js", () => ({
  getClientAppContext: () => ({ platform: "android", version: "1.7.0" }),
}));
import { rewardedAdsRoutes } from "./rewarded-ads";

function app() {
  const server = new Hono();
  server.use("/api/v1/rewarded-ads/*", async (c, next) => {
    c.set("user", { id: "actor-A", username: "fixture", role: "USER" });
    await next();
  });
  server.route("/api/v1/rewarded-ads", rewardedAdsRoutes);
  return server;
}

describe("AG1-ECON-060 retired rewarded endpoints always private and never dispatch Core", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["GET", "/status?platform=ANDROID", undefined],
    ["POST", "/session", {}],
    ["POST", "/events", { eventType: "REWARDED" }],
    ["POST", "/grant", { sessionId: "session-1" }],
  ])("retired %s %s is 410 no-store and never dispatches Core", async (method, suffix, payload) => {
    const response = await app().request(`/api/v1/rewarded-ads${suffix}`, {
      method,
      ...(payload !== undefined ? {
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      } : {}),
    });
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "REWARDED_ACCESS_RETIRED",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.status).not.toHaveBeenCalled();
    expect(m.session).not.toHaveBeenCalled();
    expect(m.event).not.toHaveBeenCalled();
    expect(m.grant).not.toHaveBeenCalled();
  });
});
