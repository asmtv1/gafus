/**
 * AG1 cont140 AG2 WEB005 bounded three-existing-GET comparison:
 * signed JWT, registered Hono status+both achievements GET, ACTUAL
 * appSubscription Core access and ACTUAL feature flag Core function.
 * Synthetic ONLY Prisma storage, Redis rate-store and achievements data.
 * No flags/payments/subscription writes or real SQL/browser/default UI.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m=vi.hoisted(()=>({
  user:vi.fn(),subscriptions:vi.fn(),payments:vi.fn(),flagRow:vi.fn(),
  stats:vi.fn(),dates:vi.fn(),registration:vi.fn(),
  write:vi.fn(),rateHits:[] as string[],
  gated:true,activeA:true,activeB:false,expiredA:false,
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(input:{windowMs:number}){this.windowMs=input.windowMs;}
    async increment(key:string){
      m.rateHits.push(key);
      return {totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{...actual.prisma,
    user:{...actual.prisma.user,findUnique:m.user},
    appSubscription:{...actual.prisma.appSubscription,
      findMany:m.subscriptions,update:m.write,upsert:m.write,
      create:m.write,delete:m.write},
    appSubscriptionPayment:{...actual.prisma.appSubscriptionPayment,
      findFirst:m.payments,create:m.write,update:m.write},
    appFeatureFlag:{...actual.prisma.appFeatureFlag,
      findUnique:m.flagRow,upsert:m.write,update:m.write},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/achievements-server",async original=>({
  ...await original<object>(),getAchievementStats:m.stats,
  getUserTrainingDates:m.dates,
}));
// No mock of @gafus/core/services/appSubscription or appFeatureFlags.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {getAppSubscriptionAccess} from "@gafus/core/services/appSubscription";
import {
  getAppFeatureFlagEnabled,
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
} from "@gafus/core/services/appFeatureFlags";

const ACTORS={
  A:{id:"ag1-ach140-a",username:"userA",role:"USER"},
  B:{id:"ag1-ach140-b",username:"userB",role:"USER"},
} as const;
const jwt:Record<string,string>={};
const endpoints={
  status:"/api/v1/app-subscription/status",
  stats:"/api/v1/achievements",
  dates:"/api/v1/achievements/training-dates",
} as const;
type Key=keyof typeof endpoints;
const get=(key:Key,actor="A")=>app.request(endpoints[key],{
  method:"GET",
  headers:actor?{authorization:"Bearer "+(jwt[actor]??actor)}:{},
});
function noStoredPrivate(r:Response,key:Key){
  const h=(r.headers.get("cache-control")??"").toLowerCase();
  expect(h).toContain("private");expect(h).toContain("no-store");
  if(key!=="status")expect(r.headers.get("referrer-policy")).toBe("no-referrer");
}
const noWrites=()=>expect(m.write).not.toHaveBeenCalled();
async function status(actor="A"){
  const res=await get("status",actor);
  noStoredPrivate(res,"status");
  const body=await res.json() as {success:boolean;data:{
    hasActiveSubscription:boolean;status:string|null;
  }};
  expect(res.status).toBe(200);
  expect(body.success).toBe(true);
  return body.data;
}
async function achievements(key:"stats"|"dates",actor="A"){
  const res=await get(key,actor);
  noStoredPrivate(res,key);
  return res;
}
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [label,actor] of Object.entries(ACTORS))
    jwt[label]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();m.rateHits.length=0;
  m.activeA=true;m.activeB=false;m.gated=true;m.expiredA=false;
  m.user.mockImplementation(async()=>({
    role:"USER",sessionsRevokedAt:null,registrationPending:false,
  }));
  m.registration.mockResolvedValue(true);
  m.flagRow.mockImplementation(async(args:{where:{key:string};select:unknown})=>{
    expect(args.where.key).toBe(APP_FEATURE_APP_SUBSCRIPTION_GATING);
    expect(args.select).toEqual({enabled:true});
    return {enabled:m.gated};
  });
  m.subscriptions.mockImplementation(async(args:{
    where:{userId:string;status:unknown};include?:unknown;
  })=>{
    const active=args.where.userId===ACTORS.A.id?m.activeA:m.activeB;
    const ended=args.where.userId===ACTORS.A.id&&m.expiredA;
    if(!active&&!ended)return [];
    return [{
      id:"sub-"+args.where.userId,userId:args.where.userId,status:"ACTIVE",
      isLifetime:!ended,provider:"MANUAL",planCode:"MONTHLY",
      currentPeriodEnd:ended?new Date("2020-01-01T00:00:00Z"):null,
      createdAt:new Date("2026-10-20T00:00:00Z"),
      yookassaPaymentMethodId:null, cancelAtPeriodEnd:false,
      yookassaPaymentMethodLast4:null,yookassaPaymentMethodTitle:null,
      payments:[],
    }];
  });
  m.payments.mockResolvedValue(null);
  m.stats.mockImplementation(async(userId:string)=>({
    owner:userId,totalCourses:2,completed:1,
  }));
  m.dates.mockImplementation(async(userId:string)=>[
    new Date(userId===ACTORS.A.id?"2026-10-20T00:00:00Z":
      "2026-10-21T00:00:00Z"),
  ]);
});
describe("AG1 cont140 AG2 flag/status/stats/dates actor consistency",()=>{
  it("actual Core function refs and ACTIVE A status -> both achievements GET",async()=>{
    expect(typeof getAppSubscriptionAccess).toBe("function");
    expect(typeof getAppFeatureFlagEnabled).toBe("function");
    expect((await status()).hasActiveSubscription).toBe(true);
    for(const key of ["stats","dates"] as const){
      const res=await achievements(key);
      expect(res.status).toBe(200);
      const body=await res.json() as {success:boolean;data:unknown};
      expect(body.success).toBe(true);
    }
    expect(m.stats).toHaveBeenCalledWith(ACTORS.A.id);
    expect(m.dates).toHaveBeenCalledWith(ACTORS.A.id);
    expect(m.subscriptions).toHaveBeenCalled();
    noWrites();
  });
  it("revocation AFTER status BEFORE both GETs rechecks and denies",async()=>{
    expect((await status()).hasActiveSubscription).toBe(true);
    m.activeA=false;
    for(const key of ["stats","dates"] as const){
      const res=await achievements(key);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        success:false,code:"SUBSCRIPTION_REQUIRED",
      });
    }
    expect((await status()).hasActiveSubscription).toBe(false);
    expect(m.stats).not.toHaveBeenCalled();expect(m.dates).not.toHaveBeenCalled();
    noWrites();
  });
  it("owner A→B→A cannot borrow A access on both GETs",async()=>{
    expect((await status("A")).hasActiveSubscription).toBe(true);
    expect((await status("B")).hasActiveSubscription).toBe(false);
    for(const key of ["stats","dates"] as const){
      expect((await achievements(key,"B")).status).toBe(403);
      expect((await achievements(key,"A")).status).toBe(200);
    }
    expect(m.stats).toHaveBeenCalledWith(ACTORS.A.id);
    expect(m.stats).not.toHaveBeenCalledWith(ACTORS.B.id);
    noWrites();
  });
  it("EXPIRED active row has no right despite ACTIVE DB status",async()=>{
    m.activeA=false;m.expiredA=true;
    const s=await status();
    expect(s.hasActiveSubscription).toBe(false);
    expect(s.status).toBeNull();
    expect((await achievements("stats")).status).toBe(403);
    expect((await achievements("dates")).status).toBe(403);
    noWrites();
  });
  it("missing feature flag defaults TRUE and denies access",async()=>{
    m.activeA=false;
    m.flagRow.mockResolvedValue(null);
    expect((await status()).hasActiveSubscription).toBe(false);
    expect((await achievements("stats")).status).toBe(403);
    expect((await achievements("dates")).status).toBe(403);
    expect(m.flagRow).toHaveBeenCalled();
    noWrites();
  });
  it("explicit feature gate false: status remains inactive, achievements bypass by SOURCE design",async()=>{
    m.activeA=false;m.gated=false;
    expect((await status()).hasActiveSubscription).toBe(false);
    expect((await achievements("stats")).status).toBe(200);
    expect((await achievements("dates")).status).toBe(200);
    // Achievements must not even call access when gate disabled:
    // the single STATUS GET does call access.
    expect(m.subscriptions).toHaveBeenCalledTimes(2);
    noWrites();
  });
  it("feature flag error => both achievements 503, status separately reads active entitlement",async()=>{
    m.flagRow.mockRejectedValue(Error("AG1_PRIVATE_FEATURE_KEY"));
    expect((await status()).hasActiveSubscription).toBe(true);
    for(const key of ["stats","dates"] as const){
      const r=await achievements(key);
      expect(r.status).toBe(503);
      const body=await r.text();
      expect(body).toContain("ACHIEVEMENTS_ACCESS_CHECK_FAILED");
      expect(body).not.toContain("AG1_PRIVATE_FEATURE_KEY");
    }
    expect(m.stats).not.toHaveBeenCalled();expect(m.dates).not.toHaveBeenCalled();
    noWrites();
  });
  it("access storage failure => status masked500, achievements 503, no stats/dates",async()=>{
    m.subscriptions.mockRejectedValue(Error("AG1_PRIVATE_SUBSCRIPTION_PAYMENT"));
    const s=await get("status");
    expect(s.status).toBe(500);noStoredPrivate(s,"status");
    expect(await s.text()).not.toContain("AG1_PRIVATE_SUBSCRIPTION_PAYMENT");
    for(const key of ["stats","dates"] as const){
      const r=await achievements(key);expect(r.status).toBe(503);
      expect(await r.text()).not.toContain("AG1_PRIVATE_SUBSCRIPTION_PAYMENT");
    }
    expect(m.stats).not.toHaveBeenCalled();expect(m.dates).not.toHaveBeenCalled();
    noWrites();
  });
  it("missing/bad JWT on status/stats/dates => 401, no protected SELECT",async()=>{
    for(const key of ["status","stats","dates"] as const){
      for(const actor of ["","bad.token"]){
        const r=await get(key,actor);
        expect(r.status).toBe(401);noStoredPrivate(r,key);
      }
    }
    expect(m.subscriptions).not.toHaveBeenCalled();
    expect(m.stats).not.toHaveBeenCalled();
    noWrites();
  });
});
