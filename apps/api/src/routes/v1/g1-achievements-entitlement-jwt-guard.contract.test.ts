/** Source Hono JWT+subscription guard. Synthetic transport, no PG/providers. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({flag:vi.fn(),access:vi.fn(),stats:vi.fn(),dates:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{user:{findUnique:async()=>({sessionsRevokedAt:null,registrationPending:false, role: "USER",})}}}));
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
const app=new Hono();
app.use("/api/v1/achievements/*",authMiddleware);
app.route("/api/v1/achievements",achievementsRoutes);
const origin="http://local.test";
let jwtA="",jwtB="";
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  jwtA=await generateAccessToken({id:"actor-A",username:"a",role:"USER"});
  jwtB=await generateAccessToken({id:"actor-B",username:"b",role:"USER"});
});
beforeEach(()=>{
  vi.clearAllMocks();m.flag.mockResolvedValue(true);
  m.access.mockResolvedValue({hasActiveSubscription:true});
  m.stats.mockResolvedValue({totalCourses:2,achievements:[],lastUpdated:new Date()});
  m.dates.mockResolvedValue([new Date("2026-10-01T00:00:00Z")]);
});
const get=(suffix:string,jwt=jwtA,cookie=false)=>app.request(
  origin+"/api/v1/achievements"+suffix,
  {headers:cookie?{cookie:`gafus_access=${jwt}`}:{authorization:`Bearer ${jwt}`}},
);
const paths=["","/training-dates"] as const;
describe("AG1 Achievements Hono JWT/Next subscription snapshot parity",()=>{
  it.each(paths)("AC01 no subscription blocks %s before Core",async path=>{
    m.access.mockResolvedValueOnce({hasActiveSubscription:false,status:null});
    const res=await get(path);expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({success:false,code:"SUBSCRIPTION_REQUIRED"});
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(m.stats).not.toHaveBeenCalled();expect(m.dates).not.toHaveBeenCalled();
    expect(m.access).toHaveBeenCalledWith("actor-A");
  });
  it.each(["PENDING","PAST_DUE","EXPIRED"])("AC02 %s denies",async status=>{
    m.access.mockResolvedValueOnce({hasActiveSubscription:false,status});
    expect((await get("/training-dates")).status).toBe(403);
    expect(m.dates).not.toHaveBeenCalled();
  });
  it("AC03 active JWT: both GETs, private/no-store no-referrer",async()=>{
    m.stats.mockResolvedValueOnce({
      totalCourses:2,achievements:[],lastUpdated:new Date("2026-10-23T11:12:13.000Z"),
    });
    const a=await get("");const b=await get("/training-dates");
    expect(a.status).toBe(200);expect(b.status).toBe(200);
    expect(await a.json()).toEqual({
      success:true,data:{totalCourses:2,achievements:[],lastUpdated:"2026-10-23T11:12:13.000Z"},
    });
    expect(await b.json()).toEqual({
      success:true,data:{dates:["2026-10-01T00:00:00.000Z"]},
    });
    expect(a.headers.get("cache-control")).toContain("no-store");
    expect(b.headers.get("cache-control")).toContain("no-store");
    expect(a.headers.get("referrer-policy")).toBe("no-referrer");
    expect(b.headers.get("referrer-policy")).toBe("no-referrer");
    expect(m.stats).toHaveBeenCalledWith("actor-A");
    expect(m.dates).toHaveBeenCalledWith("actor-A");
  });
  it("AC04 actor B cannot borrow A subscription",async()=>{
    m.access.mockImplementation(async(id:string)=>({hasActiveSubscription:id==="actor-A"}));
    expect((await get("/",jwtB)).status).toBe(403);
    expect(m.stats).not.toHaveBeenCalled();expect(m.access).toHaveBeenCalledWith("actor-B");
  });
  it("AC05 absent/invalid JWT stops before snapshot",async()=>{
    expect((await app.request(origin+"/api/v1/achievements")).status).toBe(401);
    expect((await get("/","invalid.jwt")).status).toBe(401);
    expect(m.access).not.toHaveBeenCalled();
  });
  it("AC06 cookie GET owner only from token not forged query",async()=>{
    const res=await get("/training-dates?userId=actor-B",jwtA,true);
    expect(res.status).toBe(200);
    expect(m.access).toHaveBeenCalledWith("actor-A");
    expect(m.dates).toHaveBeenCalledWith("actor-A");
  });
  it("AC07 flag disabled => skip access like Next",async()=>{
    m.flag.mockResolvedValueOnce(false);
    expect((await get("")).status).toBe(200);expect(m.access).not.toHaveBeenCalled();
  });
  it("AC08 snapshot error fails closed 503, sanitized",async()=>{
    m.access.mockRejectedValueOnce(new Error("SYNTHETIC_PAYMENT_SECRET"));
    const res=await get("");expect(res.status).toBe(503);
    const text=await res.text();expect(text).not.toContain("SECRET");
    expect(text).toContain("ACHIEVEMENTS_ACCESS_CHECK_FAILED");
    expect(m.stats).not.toHaveBeenCalled();
  });
  it("AC09 feature flag error also fails closed",async()=>{
    m.flag.mockRejectedValueOnce(new Error("FLAG_SECRETS"));
    expect((await get("/training-dates")).status).toBe(503);
    expect(m.access).not.toHaveBeenCalled();expect(m.dates).not.toHaveBeenCalled();
  });
  it("AC10 stats error returns private sanitized 500, never raw user/session data",async()=>{
    m.stats.mockRejectedValueOnce(new Error("SYNTHETIC_ACHIEVEMENT_PRIVATE_PROFILE"));
    const res=await get("");
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).not.toContain("PRIVATE_PROFILE");
  });
  it("AC11 training dates failure sanitized, never raw training details",async()=>{
    m.dates.mockRejectedValueOnce(new Error("SYNTHETIC_TRAINING_PRIVATE_SESSION"));
    const res=await get("/training-dates");
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).not.toContain("PRIVATE_SESSION");
  });
});
