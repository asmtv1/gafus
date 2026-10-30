/**
 * AG4 TR013 exact registered read-only trainer steps: actual Hono app,
 * JWT verifier/auth/rate middleware, mocked Core + Prisma auth-session.
 * No real SQL, HTTP socket, TLS, browser, provider, writes or new client mount.
 */
import { randomBytes } from "node:crypto";
import { beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m=vi.hoisted(()=>({
  read:vi.fn(),registration:vi.fn(),session:vi.fn(),write:vi.fn(),
  rateLimited:false,rateKeys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60_000;
    init(x:{windowMs:number}){this.windowMs=x.windowMs;}
    async increment(k:string){
      m.rateKeys.push(k);
      return {totalHits:m.rateLimited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async actual=>{
  const a=await actual<typeof PrismaModule>();
  return {...a,prisma:{...a.prisma,
    user:{...a.prisma.user,findUnique:m.session},
    step:{...a.prisma.step,create:m.write,update:m.write,delete:m.write},
    stepTemplate:{...a.prisma.stepTemplate,create:m.write,update:m.write,delete:m.write},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/trainerStep",async (importOriginal)=>({
  ...await importOriginal<typeof import("@gafus/core/services/trainerStep")>(),
  getVisibleSteps:m.read,
}));
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { visibleStepSchema } from "../../../../../apps/trainer-panel/src/trainer-vite/tr013VisibleStepsRead20261022";

const PRIVATE="SECRET_USER_EMAIL_STEP_MEDIA_AND_INTERNAL_FEE";
const actors={
  A:{id:"trainer-A",username:"trainer_a",role:"TRAINER"},
  B:{id:"trainer-B",username:"trainer_b",role:"TRAINER"},
  ADMIN:{id:"admin-1",username:"admin",role:"ADMIN"},
  MOD:{id:"mod-1",username:"mod",role:"MODERATOR"},
  USER:{id:"user-1",username:"user",role:"USER"},
  PARTNER:{id:"partner-1",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
const date=(iso:string)=>new Date(iso);
const make=(id:string,owner:string,opts:Record<string,unknown>={})=>({
  id,title:"Title "+id,description:"Description "+id,
  durationSec:90,estimatedDurationSec:null,
  type:"TRAINING",videoUrl:null,imageUrls:[],pdfUrls:[],
  checklist:null,surveySlug:null,isDailyCourse:false,
  authorId:owner,
  createdAt:date("2026-10-22T09:00:00.000Z"),
  updatedAt:date("2026-10-22T09:30:00.000Z"),
  author:{username:"user_"+owner,profile:{fullName:"Full "+owner,
    email:PRIVATE,privateNote:PRIVATE},passwordHash:PRIVATE},
  stepLinks:[{id:"steplink-private",stepId:id,order:99,
    accountCredentials:PRIVATE,
    day:{id:"day-private",authorId:PRIVATE,diaryEntries:[{content:PRIVATE}],
      dayLinks:[{id:"daylink-private",order:23,userTrainings:[{secret:PRIVATE}],
        course:{id:"course_public",name:"Course",shortDesc:"Short",
          logoImg:"/course.png",authorId:PRIVATE,access:[{email:PRIVATE}]}}]}}],
  secretPrivateInfo:PRIVATE,ownerEmail:PRIVATE,
  ...opts,
});
const stored=[
  make("B-mid",actors.B.id,{createdAt:date("2026-10-20T08:00:00.000Z")}),
  make("A-late",actors.A.id,{createdAt:date("2026-10-22T08:00:00.000Z")}),
  make("A-daily",actors.A.id,{isDailyCourse:true,
    createdAt:date("2026-10-21T08:00:00.000Z")}),
  make("A-early",actors.A.id,{createdAt:date("2026-10-18T08:00:00.000Z"),
    author:{username:"user_"+actors.A.id,profile:null,secret:PRIVATE}}),
  make("B-daily",actors.B.id,{isDailyCourse:true,
    createdAt:date("2026-10-22T07:00:00.000Z")}),
];
const request=(who:string,suffix="",method="GET")=>
  app.request("/api/v1/trainer/steps"+suffix,{
    method,headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
  });
const headers=(r:Response)=>{
  const cache=(r.headers.get("cache-control")??"")
    .toLowerCase().split(",").map(x=>x.trim());
  expect(cache).toContain("private");expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>expect(m.write).not.toHaveBeenCalled();
const noCore=()=>expect(m.read).not.toHaveBeenCalled();
const safe=(x:unknown)=>expect(JSON.stringify(x)).not.toContain(PRIVATE);
const sortedIds=(owner:string|undefined,daily:boolean)=>
  stored.filter(s=>s.isDailyCourse===daily&&(!owner||s.authorId===owner))
    .sort((a,b)=>(b.createdAt as Date).getTime()-
      (a.createdAt as Date).getTime())
    .map(s=>s.id);
const exactFieldKeys=[
  "id","title","description","durationSec","estimatedDurationSec","type",
  "videoUrl","imageUrls","pdfUrls","checklist","surveySlug","isDailyCourse",
  "authorId","createdAt","updatedAt","author","stepLinks",
].sort();
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [who,actor] of Object.entries(actors))
    jwt[who]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();
  m.rateLimited=false;m.rateKeys.length=0;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(actors).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
  m.read.mockImplementation(async (
    actorId:string,allowMixed:boolean,opts:{isDailyCourse?:boolean},
  )=>stored.filter(s=>
    s.isDailyCourse===(opts.isDailyCourse??false) &&
    (allowMixed||s.authorId===actorId))
    .sort((a,b)=>(b.createdAt as Date).getTime()-
      (a.createdAt as Date).getTime()));
});
describe("TR013 frozen mounted GET /api/v1/trainer/steps signed JWT",()=>{
  it("A->B->A strict owner, default daily=false, exact nested whitelist and ISO",async()=>{
    for(const who of ["A","B","A"] as const){
      const r=await request(who);
      expect(r.status).toBe(200);headers(r);
      const body=await r.json();
      expect(Object.keys(body).sort()).toEqual(["data","success"]);
      expect(body.data.map((s:{id:string})=>s.id))
        .toEqual(sortedIds(actors[who].id,false));
      for(const step of body.data as Record<string,unknown>[]){
        expect(Object.keys(step).sort()).toEqual(exactFieldKeys);
        expect(step.authorId).toBe(actors[who].id);
        expect(step.isDailyCourse).toBe(false);
        expect(visibleStepSchema.safeParse(step).success).toBe(true);
        const author=step.author as Record<string,unknown>;
        expect(Object.keys(author).sort()).toEqual(["profile","username"]);
        const link=(step.stepLinks as Record<string,unknown>[])[0]!;
        expect(Object.keys(link)).toEqual(["day"]);
        const day=link.day as Record<string,unknown>;
        expect(Object.keys(day)).toEqual(["dayLinks"]);
        const dl=(day.dayLinks as Record<string,unknown>[])[0]!;
        expect(Object.keys(dl)).toEqual(["course"]);
        expect(Object.keys(dl.course as Record<string,unknown>).sort()).toEqual([
          "id","logoImg","name","shortDesc",
        ]);
        expect(step.createdAt).toMatch(/Z$/);
        expect(step.updatedAt).toMatch(/Z$/);
      }
      safe(body);noWrites();
    }
    expect(m.read.mock.calls).toEqual([
      [actors.A.id,false,{isDailyCourse:false}],
      [actors.B.id,false,{isDailyCourse:false}],
      [actors.A.id,false,{isDailyCourse:false}],
    ]);
  });
  it.each(["ADMIN","MOD"] as const)(
    "%s sees all authors in existing mixed role, sorted within regular scope",
    async who=>{
      const r=await request(who);
      expect(r.status).toBe(200);headers(r);
      const body=await r.json();
      expect(body.data.map((s:{id:string})=>s.id))
        .toEqual(sortedIds(undefined,false));
      expect(new Set(body.data.map((s:{authorId:string})=>s.authorId)))
        .toEqual(new Set([actors.A.id,actors.B.id]));
      expect(m.read).toHaveBeenCalledExactlyOnceWith(
        actors[who].id,true,{isDailyCourse:false},
      );
      safe(body);noWrites();
    },
  );
  it.each(["A","ADMIN","MOD"] as const)(
    "%s explicit daily=true scopes read but does not write",async who=>{
      const elevated=who!=="A";
      const r=await request(who,"?isDailyCourse=true");
      expect(r.status).toBe(200);headers(r);
      const body=await r.json();
      expect(body.data.map((s:{id:string})=>s.id))
        .toEqual(sortedIds(elevated?undefined:actors.A.id,true));
      expect(body.data.every((x:{isDailyCourse:boolean})=>x.isDailyCourse))
        .toBe(true);
      expect(m.read).toHaveBeenCalledExactlyOnceWith(
        actors[who].id,elevated,{isDailyCourse:true},
      );
      safe(body);noWrites();
    },
  );
  it("explicit false has same semantics as omitted and returns nullable profile",async()=>{
    const r=await request("A","?isDailyCourse=false");
    expect(r.status).toBe(200);headers(r);
    const body=await r.json();
    expect(body.data.map((s:{id:string})=>s.id))
      .toEqual(["A-late","A-early"]);
    expect(body.data[1].author.profile).toBeNull();
    expect(visibleStepSchema.safeParse(body.data[1]).success).toBe(true);
    noWrites();
  });
  it.each(["USER","PARTNER"] as const)(
    "%s forbidden 403 before Core, does not get mixed list",async who=>{
      const r=await request(who);
      expect(r.status).toBe(403);headers(r);
      expect(await r.json()).toEqual({
        success:false,code:"FORBIDDEN",error:"Недостаточно прав",
      });
      noCore();noWrites();
    },
  );
  it.each(["","bad.jwt"])("guest/invalid 401 before limiter/Core: %s",async who=>{
    const r=await request(who);
    expect(r.status).toBe(401);headers(r);
    expect(await r.json()).toEqual({
      success:false,code:"UNAUTHORIZED",error:"Не авторизован",
    });
    expect(m.rateKeys).toHaveLength(0);
    noCore();noWrites();
  });
  it("registration pending keeps distinct machine code and private headers",async()=>{
    m.registration.mockResolvedValueOnce(false);
    const r=await request("A");
    expect(r.status).toBe(401);headers(r);
    expect(await r.json()).toMatchObject({
      success:false,code:"REGISTRATION_PENDING",
    });
    noCore();noWrites();
  });
  it("limiter 429 after signed JWT, before Core, private and typed code",async()=>{
    m.rateLimited=true;
    const r=await request("A");
    expect(r.status).toBe(429);headers(r);
    expect(await r.json()).toEqual({
      success:false,code:"RATE_LIMITED",error:"Слишком много запросов",
    });
    expect(m.rateKeys.length).toBeGreaterThan(0);
    noCore();noWrites();
  });
  it.each([
    "?isDailyCourse=1","?isDailyCourse=yes","?isDailyCourse=",
    "?isDailyCourse=TRUE","?isDailyCourse=true&isDailyCourse=false",
    "?authorId=trainer-B","?isAdmin=true","?isAdminOrModerator=true",
    "?userId=trainer-B","?ownerId=trainer-B","?page=1",
  ])("rejects invalid query %s as BAD_QUERY, never invokes Core",async suffix=>{
    const r=await request("A",suffix);
    expect(r.status).toBe(400);headers(r);
    expect(await r.json()).toEqual({
      success:false,code:"BAD_QUERY",error:"Некорректный запрос",
    });
    noCore();noWrites();
  });
  it("missing trainer rows returns confirmed [] (not 404)",async()=>{
    m.read.mockResolvedValueOnce([]);
    const r=await request("B");
    expect(r.status).toBe(200);headers(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    expect(m.read).toHaveBeenCalledExactlyOnceWith(
      actors.B.id,false,{isDailyCourse:false},
    );
    noWrites();
  });
  it("Core DB failure yields safe 500, never fabricated empty list",async()=>{
    m.read.mockRejectedValueOnce(new Error(PRIVATE+" SQL owner=trainer-A"));
    const r=await request("A");
    expect(r.status).toBe(500);headers(r);
    const body=await r.json();
    expect(body).toEqual({
      success:false,code:"INTERNAL_SERVER_ERROR",error:"Внутренняя ошибка сервера",
    });
    safe(body);noWrites();
  });
  it.each(["foreign","daily","invalidDate","invalidNested","unsorted"] as const)(
    "malformed Core response %s fails closed 500 with no PII",async mode=>{
      const broken=stored.filter(s=>s.authorId===actors.A.id&&!s.isDailyCourse)
        .sort((a,b)=>(b.createdAt as Date).getTime()-
          (a.createdAt as Date).getTime());
      switch(mode){
      case "foreign":
        m.read.mockResolvedValueOnce([make("foreign",actors.B.id)]);break;
      case "daily":
        m.read.mockResolvedValueOnce([make("daily",actors.A.id,{isDailyCourse:true})]);break;
      case "invalidDate":
        m.read.mockResolvedValueOnce([make("invalid",actors.A.id,{createdAt:new Date(NaN)})]);break;
      case "invalidNested":
        m.read.mockResolvedValueOnce([make("bad",actors.A.id,{stepLinks:[{
          day:{dayLinks:[{course:{id:"course-public",name:"Course",shortDesc:"Short"}}]},
        }]})]);break;
      case "unsorted":
        m.read.mockResolvedValueOnce([...broken].reverse());break;
      }
      const r=await request("A");
      expect(r.status).toBe(500);headers(r);
      const body=await r.json();
      expect(body).toEqual({
        success:false,code:"INTERNAL_SERVER_ERROR",error:"Внутренняя ошибка сервера",
      });
      safe(body);noWrites();
    },
  );
  it("POST cannot invoke mounted GET or any Core write",async()=>{
    const r=await request("A","","POST");
    expect(r.status).not.toBe(200);
    noCore();noWrites();
  });
});
