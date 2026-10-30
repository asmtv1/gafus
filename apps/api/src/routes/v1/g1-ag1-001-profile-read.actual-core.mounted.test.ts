/**
 * AG1-001 distinct GET /user/profile application + Core signed-Hono boundary.
 * Real route, auth, app port and Core projection; ONLY Prisma/Auth registration
 * and RedisStore mocked. No real DB/Redis/TLS/browser and zero DB writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  lookup: vi.fn(), registration: vi.fn(), write: vi.fn(),
  throttle: false, rateKeys: [] as string[],
  missingProfile: false, faultProfile: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60000;
    init(v:{windowMs:number}) { this.windowMs=v.windowMs; }
    async increment(key:string) {
      m.rateKeys.push(key);
      return {totalHits:m.throttle?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const db=await original<typeof PrismaModule>();
  return {...db,prisma:{
    ...db.prisma,
    user:{...db.prisma.user,findUnique:m.lookup,
      update:m.write,create:m.write,delete:m.write},
    userProfile:{...db.prisma.userProfile,
      upsert:m.write,update:m.write,create:m.write,delete:m.write},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(), isRegistrationCompleted:m.registration,
}));
// Important: NO mock for @gafus/core/services/user, app or logger.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";

const actors={
  A:{id:"read_owner_A",username:"owner_a",role:"USER"},
  B:{id:"read_owner_B",username:"owner_b",role:"USER"},
} as const;
const tokens:Record<string,string>={};
const users:Record<string,Record<string,unknown>>={
  read_owner_A:{
    id:"read_owner_A",username:"owner_a",role:"USER",
    phone:"+70000000001",email:"owner_a@example.invalid",
    passwordSetAt:new Date("2026-01-01T10:00:00.000Z"),
    onboardingTourCompletedAt:new Date("2026-10-01T12:00:00.000Z"),
    accounts:[{id:"vk-a"}],
    profile:{
      fullName:"Анна",city:"Москва",about:"Привет",
      telegram:"@owner_a",instagram:null,website:null,
      birthDate:new Date("2000-04-23T00:00:00.000Z"),avatarUrl:null,
    },
  },
  read_owner_B:{
    id:"read_owner_B",username:"owner_b",role:"USER",
    phone:null,email:"owner_b@example.invalid",
    passwordSetAt:null,onboardingTourCompletedAt:null,
    accounts:[],profile:null,
  },
};
const profileA={
  id:"read_owner_A",username:"owner_a",role:"USER",
  phone:"+70000000001",email:"owner_a@example.invalid",
  hasAppPassword:true,hasVkLinked:true,
  onboardingTourCompletedAt:"2026-10-01T12:00:00.000Z",
  profile:{
    fullName:"Анна",city:"Москва",about:"Привет",
    telegram:"@owner_a",instagram:null,website:null,
    birthDate:"2000-04-23",avatarUrl:null,
  },
};
const profileB={
  id:"read_owner_B",username:"owner_b",role:"USER",
  phone:null,email:"owner_b@example.invalid",
  hasAppPassword:false,hasVkLinked:false,
  onboardingTourCompletedAt:null,
  profile:{
    fullName:null,city:null,about:null,telegram:null,
    instagram:null,website:null,birthDate:null,avatarUrl:null,
  },
};
const request=(actor:string)=>app.request("/api/v1/user/profile",{
  method:"GET",
  headers:actor?{authorization:"Bearer "+(tokens[actor]??actor)}:{},
});
const privateHeaders=(r:Response)=>{
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>expect(m.write).not.toHaveBeenCalled();
const exactCoreSelect=(actorId:string)=>{
  expect(m.lookup).toHaveBeenCalledWith({
    where:{id:actorId},
    select:{
      id:true,username:true,phone:true,email:true,role:true,
      passwordSetAt:true,onboardingTourCompletedAt:true,
      accounts:{where:{provider:"vk"},select:{id:true}},
      profile:{select:{
        fullName:true,city:true,about:true,telegram:true,instagram:true,
        website:true,birthDate:true,avatarUrl:true,
      }},
    },
  });
};
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [k,actor] of Object.entries(actors)){
    tokens[k]=await generateAccessToken(actor);
  }
});
beforeEach(()=>{
  vi.clearAllMocks();
  m.throttle=false;
  m.missingProfile=false;
  m.faultProfile=false;
  m.rateKeys.length=0;
  m.registration.mockResolvedValue(true);
  m.lookup.mockImplementation(async (q:{
    where:{id:string};
    select:Record<string,unknown>;
  })=>{
    // ACTUAL verifyAccessToken reads a different projection before Core runs.
    if(q.select.sessionsRevokedAt === true) {
      return users[q.where.id] ? {sessionsRevokedAt:null,registrationPending:false,role:users[q.where.id].role} : null;
    }
    if(m.faultProfile) throw new Error("SYNTHETIC_QUERY_FAILURE");
    if(m.missingProfile) return null;
    return users[q.where.id]??null;
  });
});
const profileLookups=()=>m.lookup.mock.calls.filter(([q])=>
  q.select?.passwordSetAt === true);
const authLookups=()=>m.lookup.mock.calls.filter(([q])=>
  q.select?.sessionsRevokedAt === true);

describe("AG1-001 real registered GET profile -> application -> actual Core",()=>{
  it("signed A B A returns exact pre-extraction DTO and actor-only Prisma select",async()=>{
    for(const [alias,id,expected] of [
      ["A",actors.A.id,profileA],
      ["B",actors.B.id,profileB],
      ["A",actors.A.id,profileA],
    ] as const) {
      const r=await request(alias);
      expect(r.status).toBe(200);privateHeaders(r);
      expect(await r.json()).toEqual({success:true,data:expected});
      exactCoreSelect(id);
      noWrites();
    }
    expect(profileLookups().map(([q])=>q.where.id))
      .toEqual([actors.A.id,actors.B.id,actors.A.id]);
    expect(authLookups()).toHaveLength(3);
  });
  it("deleted identity: real Core null maps to unchanged private 404",async()=>{
    m.missingProfile=true;
    const r=await request("A");
    expect(r.status).toBe(404);privateHeaders(r);
    expect(await r.json()).toEqual({
      success:false,error:"Пользователь не найден",
    });
    expect(profileLookups()).toHaveLength(1);
    expect(authLookups()).toHaveLength(1);
    exactCoreSelect(actors.A.id);noWrites();
  });
  it("synthetic Prisma failure maps to unchanged 500 without extra DB operations",async()=>{
    m.faultProfile=true;
    const r=await request("A");
    expect(r.status).toBe(500);privateHeaders(r);
    expect(await r.json()).toEqual({
      success:false,error:"Ошибка получения профиля",
    });
    expect(profileLookups()).toHaveLength(1);
    expect(authLookups()).toHaveLength(1);
    noWrites();
  });
  it("guest and forged bearer stop before user-profile Core read",async()=>{
    for(const token of ["","not-a-jwt"]){
      const r=await request(token);
      expect(r.status).toBe(401);privateHeaders(r);
    }
    expect(m.lookup).not.toHaveBeenCalled();
    noWrites();
  });
  it("rate limit and registration pending stop before profile lookup",async()=>{
    m.throttle=true;
    const limited=await request("A");
    expect(limited.status).toBe(429);privateHeaders(limited);
    m.throttle=false;
    m.registration.mockResolvedValueOnce(false);
    const pending=await request("B");
    expect(pending.status).toBe(401);privateHeaders(pending);
    expect(await pending.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(profileLookups()).toHaveLength(0);
    expect(authLookups()).toHaveLength(1);
    noWrites();
  });
});
