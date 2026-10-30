/** AG1 review-only preauth no-store + in-memory 429; does NOT mount live app.ts. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({flag:vi.fn(),access:vi.fn(),stats:vi.fn(),dates:vi.fn()}));
vi.mock("@gafus/core/services/appFeatureFlags",()=>({
  APP_FEATURE_APP_SUBSCRIPTION_GATING:"app_subscription_gating_enabled",
  getAppFeatureFlagEnabled:mocks.flag,
}));
vi.mock("@gafus/core/services/appSubscription",()=>({getAppSubscriptionAccess:mocks.access}));
vi.mock("@gafus/achievements-server",()=>({
  getAchievementStats:mocks.stats,getUserTrainingDates:mocks.dates,
}));
import { achievementsRoutes } from "./achievements";
let requests=0;
const privateHarness=new Hono();
// Mirrors the UNAPPLIED AG4 review patch, not the current production app.ts.
privateHarness.use("/api/v1/achievements/*",async(c,next)=>{
  c.header("Cache-Control","private, no-store");
  c.header("Referrer-Policy","no-referrer");
  await next();c.header("Cache-Control","private, no-store");
});
privateHarness.use("/api/v1/achievements/*",async(c,next)=>{
  if(++requests>1)return c.json({success:false,code:"RATE_LIMITED"},429);
  await next();
});
privateHarness.use("/api/v1/achievements/*",async(c,next)=>{
  if(!c.req.header("authorization"))return c.json({success:false,code:"UNAUTHORIZED"},401);
  c.set("user",{id:"synthetic-owner",username:"synthetic",role:"USER"});await next();
});
privateHarness.route("/api/v1/achievements",achievementsRoutes);
beforeEach(()=>{
  requests=0;vi.clearAllMocks();
  mocks.flag.mockResolvedValue(true);mocks.access.mockResolvedValue({hasActiveSubscription:true});
  mocks.stats.mockResolvedValue({totalCourses:1});mocks.dates.mockResolvedValue([]);
});
describe("isolated preauth achievements privacy review, not live app.ts",()=>{
  it("P01 unsigned GET 401 has no-store, no data access",async()=>{
    const res=await privateHarness.request("http://local.test/api/v1/achievements/training-dates");
    expect(res.status).toBe(401);expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("P02 second request bounded in-memory 429 keeps no-store",async()=>{
    const url="http://local.test/api/v1/achievements/training-dates";
    const init={headers:{authorization:"synthetic-only"}};
    expect((await privateHarness.request(url,init)).status).toBe(200);
    const denied=await privateHarness.request(url,init);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.dates).toHaveBeenCalledTimes(1);
  });
});
