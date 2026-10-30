/**
 * AG1-001: actual registered Hono + signed JWT -> thin application
 * -> real Core updateUserProfile -> mocked Prisma. No live SQL/Redis/network.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  upsert:vi.fn(), registration:vi.fn(), session:vi.fn(), forbidden:vi.fn(),
  throttle:false, keys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(v:{windowMs:number}){this.windowMs=v.windowMs;}
    async increment(key:string){
      m.keys.push(key);
      return {totalHits:m.throttle?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async actualImport=>{
  const source=await actualImport<typeof PrismaModule>();
  return {...source,prisma:{
    ...source.prisma,
    user:{...source.prisma.user,findUnique:m.session},
    userProfile:{...source.prisma.userProfile,
      upsert:m.upsert,create:m.forbidden,update:m.forbidden,delete:m.forbidden},
    $transaction:m.forbidden,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// Intentionally NO mock for @gafus/core/services/user or application module.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";

const actors={
  A:{id:"profile_owner_A",username:"owner_a",role:"USER"},
  B:{id:"profile_owner_B",username:"owner_b",role:"USER"},
} as const;
const tokens:Record<string,string>={};
const rows=new Map<string,Record<string,unknown>>();
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [name,user] of Object.entries(actors)){
    tokens[name]=await generateAccessToken(user);
  }
});
beforeEach(()=>{
  vi.clearAllMocks();
  m.throttle=false;
  m.keys.length=0;
  rows.clear();
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(actors).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
  m.upsert.mockImplementation(async(q:{
    where:{userId:string};
    update:Record<string,unknown>;
    create:Record<string,unknown>;
  })=>{
    const previous=rows.get(q.where.userId);
    const next={...(previous??{userId:q.where.userId}),
      ...(previous?q.update:q.create)};
    delete (next as Record<string,unknown>).user;
    rows.set(q.where.userId,next);
    return {...next};
  });
});
const put=(who:string,payload:unknown)=>app.request("/api/v1/user/profile",{
  method:"PUT",
  headers:{"content-type":"application/json",
    authorization:"Bearer "+(tokens[who]??who)},
  body:JSON.stringify(payload),
});
const privateResponse=(r:Response)=>{
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noExtraWrites=()=>expect(m.forbidden).not.toHaveBeenCalled();

describe("AG1-001 real route to actual Core profile persistence boundary",()=>{
  it("A B A JSON plus exact 3 owner-scoped upsert side effects, no implicit clear",async()=>{
    const a=await put("A",{
      fullName:"  Анна  ",city:" Казань ",telegram:" ",birthDate:"",
    });
    expect(a.status).toBe(200);privateResponse(a);
    expect(await a.json()).toEqual({success:true,data:{
      userId:actors.A.id,fullName:"Анна",city:"Казань",
      telegram:null,birthDate:null,
    }});
    expect(m.upsert).toHaveBeenNthCalledWith(1,{
      where:{userId:actors.A.id},
      update:{fullName:"Анна",city:"Казань",telegram:null,birthDate:null},
      create:{user:{connect:{id:actors.A.id}},
        fullName:"Анна",city:"Казань",telegram:null,birthDate:null},
    });
    const b=await put("B",{city:"",about:"  Привет  "});
    expect(b.status).toBe(200);privateResponse(b);
    expect(await b.json()).toEqual({success:true,data:{
      userId:actors.B.id,city:null,about:"Привет",
    }});
    expect(m.upsert).toHaveBeenNthCalledWith(2,{
      where:{userId:actors.B.id},
      update:{city:null,about:"Привет"},
      create:{user:{connect:{id:actors.B.id}},city:null,about:"Привет"},
    });
    const a2=await put("A",{about:"  Обновлено  "});
    expect(a2.status).toBe(200);privateResponse(a2);
    expect(await a2.json()).toEqual({success:true,data:{
      userId:actors.A.id,fullName:"Анна",city:"Казань",
      telegram:null,birthDate:null,about:"Обновлено",
    }});
    expect(m.upsert).toHaveBeenNthCalledWith(3,{
      where:{userId:actors.A.id},
      update:{about:"Обновлено"},
      create:{user:{connect:{id:actors.A.id}},about:"Обновлено"},
    });
    expect(m.upsert).toHaveBeenCalledTimes(3);
    expect(rows.get(actors.B.id)).toEqual({
      userId:actors.B.id,city:null,about:"Привет",
    });
    noExtraWrites();
  });
  it("malformed city/birthDate 400 before any Core upsert",async()=>{
    for(const payload of [{city:22},{birthDate:"nonsense"}]){
      const r=await put("A",payload);
      expect(r.status).toBe(400);privateResponse(r);
    }
    expect(m.upsert).not.toHaveBeenCalled();noExtraWrites();
  });
  it("invalid signed bearer 401 before any upsert",async()=>{
    const r=await put("bad.jwt",{city:"Уфа"});
    expect(r.status).toBe(401);privateResponse(r);
    expect(m.upsert).not.toHaveBeenCalled();noExtraWrites();
  });
  it("Core persistence exception retains safe exact route 500 and one write attempt",async()=>{
    m.upsert.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE_DB_TOKEN"));
    const r=await put("A",{city:"Сочи"});
    expect(r.status).toBe(500);privateResponse(r);
    expect(await r.json()).toEqual({
      success:false,error:"Ошибка обновления профиля",
    });
    expect(m.upsert).toHaveBeenCalledOnce();
    expect(rows.size).toBe(0);noExtraWrites();
  });
  it("early limiter 429 never calls Core upsert",async()=>{
    m.throttle=true;
    const r=await put("A",{city:"Москва"});
    expect(r.status).toBe(429);privateResponse(r);
    expect(m.upsert).not.toHaveBeenCalled();noExtraWrites();
  });
});
