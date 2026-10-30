/**
 * AG1 versioned name-only registered Hono transport contract, signed JWT.
 * Core service itself is proved separately (source/mock and local real SQL).
 * No real Prisma writes, network listener, production DB or external provider.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const m=vi.hoisted(()=>({
  read:vi.fn(),cas:vi.fn(),draft:vi.fn(),session:vi.fn(),
  registration:vi.fn(),mutation:vi.fn(),limited:false,keys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(v:{windowMs:number}){this.windowMs=v.windowMs;}
    async increment(key:string){
      m.keys.push(key);
      return {totalHits:m.limited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const a=await original<typeof PrismaModule>();
  return {...a,prisma:{...a.prisma,
    user:{...a.prisma.user,findUnique:m.session},
    course:{...a.prisma.course,update:m.mutation,updateMany:m.mutation},
    $transaction:m.mutation,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/trainerCourse",async (importOriginal)=>({
  ...await importOriginal<typeof import("@gafus/core/services/trainerCourse")>(),
  getCourseDraftWithRelations:m.draft,
  readCourseNameVersion:m.read,
  updateCourseNameVersioned:m.cas,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
const actors={
 A:{id:"version_trainer_A",username:"trainerA",role:"TRAINER"},
 B:{id:"version_trainer_B",username:"trainerB",role:"TRAINER"},
 ADMIN:{id:"version_admin",username:"admin",role:"ADMIN"},
 MOD:{id:"version_mod",username:"mod",role:"MODERATOR"},
 USER:{id:"version_user",username:"user",role:"USER"},
} as const;
const bearer:Record<string,string>={};
const root="/api/v1/trainer/courses/course1";
const req=(who:string,path:string,body?:unknown)=>
  app.request(root+path,{method:body===undefined?"GET":"PATCH",
    headers:{
      ...(who?{authorization:"Bearer "+(bearer[who]??who)}:{}),
      ...(body===undefined?{}:{"content-type":"application/json"}),
    },...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
const headers=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase();
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>expect(m.mutation).not.toHaveBeenCalled();
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [name,actor] of Object.entries(actors))
    bearer[name]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();m.limited=false;m.keys.length=0;
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(actors).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
  m.registration.mockResolvedValue(true);
  m.read.mockResolvedValue({status:"found",data:{id:"course1",name:"Current",version:3}});
  m.cas.mockResolvedValue({status:"updated",data:{id:"course1",name:"Changed",version:4}});
});
describe("AG1 trainer Course.version private read + name-only CAS registered JWT",()=>{
  it.each(["A","ADMIN"] as const)(
    "%s can read private current integer version for authorized Core scope",async who=>{
      const r=await req(who,"/version");
      expect(r.status).toBe(200);headers(r);
      expect(await r.json()).toEqual({
        success:true,data:{id:"course1",name:"Current",version:3},
      });
      expect(m.read).toHaveBeenCalledExactlyOnceWith("course1",{
        id:actors[who].id,role:actors[who].role,
      });
      noWrites();
    });
  it("TRAINER can edit name at exact expectedVersion with server-owned identity",async()=>{
    const r=await req("A","/name",{name:"Changed",expectedVersion:3});
    expect(r.status).toBe(200);headers(r);
    expect(await r.json()).toEqual({
      success:true,data:{id:"course1",name:"Changed",version:4},
    });
    expect(m.cas).toHaveBeenCalledExactlyOnceWith({
      courseId:"course1",name:"Changed",expectedVersion:3,
    },{id:actors.A.id,role:"TRAINER"});
    noWrites();
  });
  it("stale CAS yields 409 and never false success",async()=>{
    m.cas.mockResolvedValueOnce({status:"stale"});
    const r=await req("A","/name",{name:"Old attempt",expectedVersion:1});
    expect(r.status).toBe(409);headers(r);
    expect(await r.json()).toEqual({
      success:false,code:"STALE_VERSION",error:"Версия курса устарела",
    });
    noWrites();
  });
  it.each(["A","ADMIN"] as const)(
    "%s masked 404 for Core foreign/notfound",async who=>{
      m.read.mockResolvedValueOnce({status:"not_found"});
      const r=await req(who,"/version");
      expect(r.status).toBe(404);headers(r);
      expect(await r.json()).toEqual({
        success:false,code:"NOT_FOUND",error:"Курс не найден",
      });
      noWrites();
    });
  it("Core CAS foreign/notfound is 404, not stale409",async()=>{
    m.cas.mockResolvedValueOnce({status:"not_found"});
    const r=await req("B","/name",{name:"No rights",expectedVersion:3});
    expect(r.status).toBe(404);headers(r);
    expect(await r.json()).toMatchObject({code:"NOT_FOUND"});
    noWrites();
  });
  it("Core unknown DB or postcommit ACK is masked500, not false 409",async()=>{
    m.cas.mockResolvedValueOnce({status:"unknown"});
    const r=await req("A","/name",{name:"Maybe committed",expectedVersion:3});
    expect(r.status).toBe(500);headers(r);
    expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    noWrites();
  });
  it.each(["MOD","USER"] as const)(
    "%s forbidden 403 before any Core call",async who=>{
      const r=await req(who,"/version");
      expect(r.status).toBe(403);headers(r);
      expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
      expect(m.read).not.toHaveBeenCalled();
      expect(m.cas).not.toHaveBeenCalled();
      noWrites();
    });
  it.each(["","fake.jwt"])(
    "no/bad bearer 401 pre Core %s",async who=>{
      const r=await req(who,"/version");
      expect(r.status).toBe(401);headers(r);
      expect(m.read).not.toHaveBeenCalled();
      expect(m.cas).not.toHaveBeenCalled();
      noWrites();
    });
  it("rate429 before Core",async()=>{
    m.limited=true;
    const r=await req("A","/version");
    expect(r.status).toBe(429);headers(r);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.cas).not.toHaveBeenCalled();
    noWrites();
  });
  it.each([
    {name:"",expectedVersion:3},
    {name:"valid",expectedVersion:0},
    {name:"valid",expectedVersion:3.5},
    {name:"valid",expectedVersion:2147483648},
    {name:"valid",expectedVersion:3,authorId:"version_trainer_B"},
    {name:"valid",expectedVersion:3,isAdmin:true},
    {name:"valid"},
  ])("strict invalid PATCH body %j fails 400 before Core",async body=>{
    const r=await req("A","/name",body);
    expect(r.status).toBe(400);headers(r);
    expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
    expect(m.cas).not.toHaveBeenCalled();
    noWrites();
  });
  it("query owner spoof rejected before Core",async()=>{
    const r=await req("A","/version?ownerId=version_trainer_B");
    expect(r.status).toBe(400);headers(r);
    expect(m.read).not.toHaveBeenCalled();
    noWrites();
  });
});
