/** AG4-approved app.ts achievements middleware order + real signed JWT Hono synthetic 401/403/429. */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Hono, type Context } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({flag:vi.fn(),access:vi.fn(),stats:vi.fn(),dates:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{user:{findUnique:async()=>({
  sessionsRevokedAt:null,registrationPending:false, role: "USER",
})}}}));
vi.mock("@gafus/core/services/auth",()=>({isRegistrationCompleted:async()=>true}));
vi.mock("@gafus/core/services/appFeatureFlags",()=>({
  APP_FEATURE_APP_SUBSCRIPTION_GATING:"app_subscription_gating_enabled",
  getAppFeatureFlagEnabled:m.flag,
}));
vi.mock("@gafus/core/services/appSubscription",()=>({getAppSubscriptionAccess:m.access}));
vi.mock("@gafus/achievements-server",()=>({
  getAchievementStats:m.stats,getUserTrainingDates:m.dates,
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { achievementsRoutes } from "./achievements";
const source=readFileSync(new URL("../../app.ts",import.meta.url),"utf8");
const base="http://local.test/api/v1/achievements";
let jwtA="";
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  jwtA=await generateAccessToken({id:"owner-A",username:"a",role:"USER"});
});
beforeEach(()=>{
  vi.clearAllMocks();
  m.flag.mockResolvedValue(true);
  m.access.mockResolvedValue({hasActiveSubscription:true});
  m.stats.mockResolvedValue({totalCourses:2});m.dates.mockResolvedValue([]);
});
function harness() {
  const h=new Hono();let count=0;
  // Mirrors the AG4-approved inline app.ts middleware; verified against source below.
  const privacy=async(c:Context,next:()=>Promise<void>)=>{
    c.header("Cache-Control","private, no-store");
    c.header("Referrer-Policy","no-referrer");
    await next();c.header("Cache-Control","private, no-store");
  };
  const syntheticLimiter=async(c:Context,next:()=>Promise<void>)=>{
    if(++count>1)return c.json({success:false,code:"RATE_LIMITED"},429);
    await next();
  };
  h.use("/api/v1/achievements",privacy);
  h.use("/api/v1/achievements/*",privacy,syntheticLimiter);
  h.use("/api/v1/achievements/*",authMiddleware);
  h.route("/api/v1/achievements",achievementsRoutes);
  return h;
}
const paths=["","/training-dates"] as const;
const headers={authorization:()=>`Bearer ${jwtA}`};
const assertPrivate=(r:Response)=>{
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
describe("AG1 applied Achievements preauth source & in-memory negative gates",()=>{
  it("A01 actual app.ts source order sets no-store ahead of Redis and signed-JWT auth",()=>{
    expect(source).toContain("const achievementPrivateNoStore = async");
    expect(source).toContain('app.use("/api/v1/achievements", achievementPrivateNoStore)');
    expect(source).toContain('app.use("/api/v1/achievements/*", achievementPrivateNoStore, apiRateLimiter)');
    expect(source).toContain('app.use("/api/v1/achievements/*", authMiddleware)');
    const first=source.indexOf('app.use("/api/v1/achievements/*", achievementPrivateNoStore');
    const auth=source.indexOf('app.use("/api/v1/achievements/*", authMiddleware)');
    expect(first).toBeLessThan(auth);
  });
  it.each(paths)("A02 missing JWT 401 cache+referrer for %s",async path=>{
    const r=await harness().request(base+path);
    expect(r.status).toBe(401);assertPrivate(r);
    expect(m.access).not.toHaveBeenCalled();expect(m.stats).not.toHaveBeenCalled();
  });
  it.each(paths)("A03 second signed JWT GET synthetic 429 still no-store for %s",async path=>{
    const h=harness();const i={headers:{authorization:headers.authorization()}};
    const first=await h.request(base+path,i);expect(first.status).toBe(200);assertPrivate(first);
    const blocked=await h.request(base+path,i);
    expect(blocked.status).toBe(429);assertPrivate(blocked);
  });
  it.each(paths)("A04 absent active snapshot 403 before private statistics for %s",async path=>{
    m.access.mockResolvedValueOnce({hasActiveSubscription:false,status:"PENDING"});
    const r=await harness().request(base+path,{headers:{authorization:headers.authorization()}});
    expect(r.status).toBe(403);assertPrivate(r);
    expect((await r.json()).code).toBe("SUBSCRIPTION_REQUIRED");
    expect(m.stats).not.toHaveBeenCalled();expect(m.dates).not.toHaveBeenCalled();
  });
  it.each(paths)("A05 snapshot error 503 sanitized no-store for %s",async path=>{
    m.access.mockRejectedValueOnce(new Error("SYNTHETIC_APPLE_ACCOUNT_TOKEN_PRIVATE"));
    const r=await harness().request(base+path,{headers:{authorization:headers.authorization()}});
    expect(r.status).toBe(503);assertPrivate(r);
    expect((await r.text())).not.toContain("PRIVATE");
  });
  it("A06 current Achievements server info-level logs omit userId after 2 AG4-approved patches",()=>{
    const stats=readFileSync(new URL("../../../../../packages/achievements-server/src/statsService.ts",import.meta.url),"utf8");
    const dates=readFileSync(new URL("../../../../../packages/achievements-server/src/datesService.ts",import.meta.url),"utf8");
    expect(stats).toContain('logger.info("Achievement stats computed", {');
    expect(stats).not.toMatch(/logger\.info\("Achievement stats computed", \{\s*userId/);
    expect(dates).toContain('logger.info("Fetching user training dates")');
    expect(dates).toContain('logger.info("Retrieved training dates", { count: uniqueDates.length })');
  });
});
