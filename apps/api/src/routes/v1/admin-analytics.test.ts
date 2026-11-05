import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), role: vi.fn(), reengagement: vi.fn(), rewarded: vi.fn(), quality:vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fake.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fake.reg }));
vi.mock("@gafus/core/services/adminUser", () => ({ readAdminActorRole: fake.role }));
vi.mock("@gafus/core/services/adminReengagement", () => ({
  getReengagementMetrics: fake.reengagement,
}));
vi.mock("@gafus/core/services/adminRewardedAds", () => ({
  getRewardedAdsAdminDashboard: fake.rewarded,
}));
vi.mock("@gafus/core/services/videoPlaybackQuality", () => ({
  getVideoPlaybackQualityReport: fake.quality,
}));
import { authMiddleware } from "../../middleware/auth";
import { adminAnalyticsRoutes } from "./admin-analytics";
const base = "/api/v1/admin/analytics";
function app() {
  const h = new Hono();
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminAnalyticsRoutes);
  return h;
}
const req = (url: string, auth = true) => app().request(`http://local.test${base}${url}`, {
  headers: auth ? { authorization: "Bearer token" } : {},
});
beforeEach(() => {
  vi.clearAllMocks();
  fake.verify.mockResolvedValue({ id: "admin1", role: "ADMIN", username: "admin" });
  fake.reg.mockResolvedValue(true);
  fake.role.mockResolvedValue("ADMIN");
  fake.reengagement.mockResolvedValue({ success: true, data: { overview: { totalCampaigns: 2 } } });
  fake.rewarded.mockResolvedValue({ totals: { completed: 3 } });
  fake.quality.mockResolvedValue({total:12,count360:3,count720:9});
});
describe("admin analytics read endpoints", () => {
  it("denies guests to both dashboards", async () => {
    for (const path of ["/reengagement", "/rewarded-ads", "/video-quality"]) {
      expect((await req(path, false)).status).toBe(401);
    }
    expect(fake.reengagement).not.toHaveBeenCalled();
    expect(fake.rewarded).not.toHaveBeenCalled();
  });
  it.each(["USER", "MODERATOR", "TRAINER"])("denies %s", async role => {
    fake.verify.mockResolvedValue({ id: "u1", role, username: "u" });
    expect((await req("/reengagement")).status).toBe(403);
    expect((await req("/rewarded-ads")).status).toBe(403);
    expect((await req("/video-quality")).status).toBe(403);
    expect((await req("/video-quality")).status).toBe(403);
    expect(fake.rewarded).not.toHaveBeenCalled();
  });
  it("blocks a revoked admin role even if token still says ADMIN", async () => {
    fake.role.mockResolvedValue("USER");
    expect((await req("/reengagement")).status).toBe(403);
    expect((await req("/rewarded-ads")).status).toBe(403);
    expect(fake.reengagement).not.toHaveBeenCalled();
  });
  it("gets Core re-engagement metrics with no-store", async () => {
    const response = await req("/reengagement");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      success: true, data: { overview: { totalCampaigns: 2 } },
    });
  });
  it.each(["7", "30", "90"])("requests %s days of rewarded history", async days => {
    const response = await req(`/rewarded-ads?days=${days}`);
    expect(response.status).toBe(200);
    expect(fake.rewarded).toHaveBeenCalledWith({ days: Number(days) });
  });
  it("rejects unreasonable period before Core read", async () => {
    const response = await req("/rewarded-ads?days=3650");
    expect(response.status).toBe(400);
    expect(fake.rewarded).not.toHaveBeenCalled();
  });
  it.each(["7","30","90"])("GET video-quality %s days is ADMIN-only and aggregate", async days => {
    const res=await req("/video-quality?days="+days);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(fake.quality).toHaveBeenCalledWith(Number(days));
    expect((await res.json()).data.total).toBe(12);
  });
  it("rejects invalid video quality reporting periods", async () => {
    expect((await req("/video-quality?days=3650")).status).toBe(400);
    expect(fake.quality).not.toHaveBeenCalled();
  });
  it("does not expose Core errors", async () => {
    fake.reengagement.mockResolvedValue({ success: false, error: "private-db" });
    const response = await req("/reengagement");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-db");
  });
});
