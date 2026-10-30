/**
 * AG1 cont131: ACTUAL registered Hono → ACTUAL getDailyCourseScheduleRange
 * → synthetic Prisma. The existing Core service is NEVER mocked.
 * Signed JWT/auth/route/limiter wiring real in-process, Redis store mocked.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type { DailyCourseScheduleDto } from "@gafus/core/services/dailyCourse";

const m=vi.hoisted(()=>({
  schedules:vi.fn(),session:vi.fn(),registration:vi.fn(),write:vi.fn(),
  unrelated:vi.fn(),rateKeys:[] as string[],limited:false,
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(x:{windowMs:number}){this.windowMs=x.windowMs;}
    async increment(key:string){
      m.rateKeys.push(key);
      return {totalHits:m.limited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{...actual.prisma,
    user:{...actual.prisma.user,findUnique:m.session},
    dailyCourseSchedule:{...actual.prisma.dailyCourseSchedule,
      findMany:m.schedules,create:m.write,update:m.write,delete:m.write,
      deleteMany:m.write},
    dailyCourseBundle:{...actual.prisma.dailyCourseBundle,
      findMany:m.unrelated,update:m.write},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// No vi.mock("@gafus/core/services/dailyCourse").
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getDailyCourseScheduleRange as actualCore }
  from "@gafus/core/services/dailyCourse";

const PATH="/api/v1/trainer/daily-course/schedule-range";
const Q="?from=2026-10-20&to=2026-10-24";
const SECRET="TR014_AG1_PRIVATE_PAYMENTS_PERSONAL_EMAIL_MEDIA_LINK";
const actors={
  A:{id:"schedule-owner-A",username:"trainerA",role:"TRAINER"},
  B:{id:"schedule-owner-B",username:"trainerB",role:"TRAINER"},
  ADMIN:{id:"schedule-admin",username:"admin",role:"ADMIN"},
  MOD:{id:"schedule-mod",username:"mod",role:"MODERATOR"},
  USER:{id:"schedule-user",username:"user",role:"USER"},
  PARTNER:{id:"schedule-partner",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
type Stored={
  id:string;date:Date;isPublished:boolean;privateInvoice:string;
  bundle:{id:string;title:string;type:string;authorId:string;
    paymentSecrets:string;stepLinks:{id:string;secret:string}[]};
  createdBy:{id:string;username:string;privateEmail:string};
};
const make=(id:string,day:string,owner:string,stepCount:number):Stored=>({
  id,date:new Date(day+"T00:00:00.000Z"),isPublished:true,
  privateInvoice:SECRET,
  bundle:{id:"bundle-"+id,title:"Bundle "+id,type:"TRAINING",
    authorId:owner,paymentSecrets:SECRET,
    stepLinks:Array.from({length:stepCount},(_,i)=>({
      id:"link-"+id+"-"+i,secret:SECRET,
    }))},
  createdBy:{id:"creator-"+id,username:"created_"+id,privateEmail:SECRET},
});
const store:Stored[]=[
  make("A-last","2026-10-24",actors.A.id,3),
  make("B-first","2026-10-20",actors.B.id,2),
  make("A-middle","2026-10-22",actors.A.id,4),
  make("A-outside","2026-10-30",actors.A.id,5),
];
type Query={
  where:{date:{gte:Date;lte:Date};bundle?:{authorId:string}};
  orderBy:{date:"asc"};select:unknown;
};
const send=(who:string,q=Q,method="GET")=>
  app.request(PATH+q,{method,headers:who?{
    authorization:"Bearer "+(jwt[who]??who),
  }:{}});
const headers=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.unrelated).not.toHaveBeenCalled();
};
const exactSelect={
  id:true,date:true,isPublished:true,
  bundle:{select:{
    id:true,title:true,type:true,stepLinks:{select:{id:true}},
  }},
  createdBy:{select:{id:true,username:true}},
};
const exactQuery=(owner?:string)=>{
  expect(m.schedules).toHaveBeenCalledExactlyOnceWith({
    where:{
      date:{gte:new Date("2026-10-20T00:00:00.000Z"),
        lte:new Date("2026-10-24T00:00:00.000Z")},
      ...(owner?{bundle:{authorId:owner}}:{}),
    },
    orderBy:{date:"asc"},
    select:exactSelect,
  });
};
function dto(body:unknown):DailyCourseScheduleDto[]{
  const parsed=body as {success:boolean;data:DailyCourseScheduleDto[]};
  expect(Object.keys(parsed).sort()).toEqual(["data","success"]);
  expect(parsed.success).toBe(true);
  expect(Array.isArray(parsed.data)).toBe(true);
  for(const item of parsed.data){
    expect(Object.keys(item).sort()).toEqual([
      "bundle","createdBy","date","id","isPublished",
    ]);
    expect(Object.keys(item.bundle).sort()).toEqual([
      "id","stepsCount","title","type",
    ]);
    expect(Object.keys(item.createdBy).sort()).toEqual(["id","username"]);
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isSafeInteger(item.bundle.stepsCount)).toBe(true);
  }
  expect(JSON.stringify(body)).not.toContain(SECRET);
  return parsed.data;
}
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [key,value] of Object.entries(actors))
    jwt[key]=await generateAccessToken(value);
});
beforeEach(()=>{
  vi.clearAllMocks();m.rateKeys.length=0;m.limited=false;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor
      ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role }
      : null;
  });
  m.schedules.mockImplementation(async(query:Query)=>store
    .filter(x=>x.date.getTime()>=query.where.date.gte.getTime() &&
      x.date.getTime()<=query.where.date.lte.getTime() &&
      (!query.where.bundle||x.bundle.authorId===query.where.bundle.authorId))
    .sort((a,b)=>a.date.getTime()-b.date.getTime()));
});
describe("AG1 TR014 schedule-range actual signed Hono → actual Core → synthetic Prisma",()=>{
  it("uses ACTUAL Core function (not mocked) and no incidental write",()=>{
    expect(typeof actualCore).toBe("function");noWrites();
  });
  it("TRAINER A→B→A same bounded date filter and ownership",async()=>{
    for(const [who,want] of [
      ["A",["A-middle","A-last"]],
      ["B",["B-first"]],
      ["A",["A-middle","A-last"]],
    ] as const){
      m.schedules.mockClear();
      const r=await send(who);
      expect(r.status).toBe(200);headers(r);
      const data=dto(await r.json());
      expect(data.map(x=>x.id)).toEqual(want);
      expect(data.every(x=>x.date>="2026-10-20" && x.date<="2026-10-24"))
        .toBe(true);
      exactQuery(actors[who].id);noWrites();
    }
  });
  it.each(["ADMIN","MOD"] as const)(
    "%s mixed-author schedule ordered date ASC",async who=>{
      const r=await send(who);
      expect(r.status).toBe(200);headers(r);
      const data=dto(await r.json());
      expect(data.map(x=>x.id)).toEqual(["B-first","A-middle","A-last"]);
      expect(data.map(x=>x.date)).toEqual([
        "2026-10-20","2026-10-22","2026-10-24",
      ]);
      exactQuery();noWrites();
    });
  it("caller DailyCourseScheduleDto strictly reflects Core computed bundle step counts",async()=>{
    const r=await send("A");
    expect(r.status).toBe(200);headers(r);
    const data=dto(await r.json());
    expect(data).toEqual([
      {id:"A-middle",date:"2026-10-22",isPublished:true,
        bundle:{id:"bundle-A-middle",title:"Bundle A-middle",
          type:"TRAINING",stepsCount:4},
        createdBy:{id:"creator-A-middle",username:"created_A-middle"}},
      {id:"A-last",date:"2026-10-24",isPublished:true,
        bundle:{id:"bundle-A-last",title:"Bundle A-last",
          type:"TRAINING",stepsCount:3},
        createdBy:{id:"creator-A-last",username:"created_A-last"}},
    ]);
    noWrites();
  });
  it("genuine empty schedule 200 []",async()=>{
    m.schedules.mockResolvedValueOnce([]);
    const r=await send("A");
    expect(r.status).toBe(200);headers(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    exactQuery(actors.A.id);noWrites();
  });
  it.each(["USER","PARTNER"] as const)(
    "%s forbidden403 before Core read",async who=>{
      const r=await send(who);
      expect(r.status).toBe(403);headers(r);
      expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
      expect(m.schedules).not.toHaveBeenCalled();noWrites();
    });
  it.each(["","invalid.jwt"])("guest/bad JWT 401 pre-Core %s",async who=>{
    const r=await send(who);
    expect(r.status).toBe(401);headers(r);
    expect(await r.json()).toMatchObject({code:"UNAUTHORIZED"});
    expect(m.rateKeys).toHaveLength(0);
    expect(m.schedules).not.toHaveBeenCalled();noWrites();
  });
  it("registration pending 401 before Core",async()=>{
    m.registration.mockResolvedValueOnce(false);
    const r=await send("A");
    expect(r.status).toBe(401);headers(r);
    expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(m.schedules).not.toHaveBeenCalled();noWrites();
  });
  it("rate limiter429 before Core",async()=>{
    m.limited=true;
    const r=await send("A");
    expect(r.status).toBe(429);headers(r);
    expect(await r.json()).toMatchObject({code:"RATE_LIMITED"});
    expect(m.schedules).not.toHaveBeenCalled();noWrites();
  });
  it.each([
    "?from=2026-10-20",
    "?to=2026-10-24",
    "?from=2026-10-20&to=2026-10-24&authorId=foreign",
    "?from=2026-10-20&to=2026-10-24&isAdmin=true",
    "?from=2026-10-20&to=2026-10-24&limit=100",
    "?from=2026-10-20&from=2026-10-21&to=2026-10-24",
    "?from=2026-10-20&to=2026-10-24&to=2026-10-25",
    "?from=20-10-2026&to=2026-10-24",
    "?from=2026-10-20&to=not-a-date",
    "",
  ])("invalid/missing/override date query %s 400 pre-Core",async q=>{
    const r=await send("A",q);
    expect(r.status).toBe(400);headers(r);
    expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
    expect(m.schedules).not.toHaveBeenCalled();noWrites();
  });
  it("no POST schedule writing route installed",async()=>{
    const r=await send("A",Q,"POST");
    expect([404,405]).toContain(r.status);
    headers(r);noWrites();
    expect(m.schedules).not.toHaveBeenCalled();
  });
  it("DB throw masked500 not false 200 []",async()=>{
    m.schedules.mockRejectedValueOnce(Error(SECRET));
    const r=await send("A");
    expect(r.status).toBe(500);headers(r);
    const body=await r.json();
    expect(body).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    expect(JSON.stringify(body)).not.toContain(SECRET);noWrites();
  });
  it.each(["badId","badDate","outOfRange","badPublished",
    "badBundleId","badStepCount","badCreator","badOrder"] as const)(
    "corrupt Core source %s masked500, no extra fields",async kind=>{
      const row=structuredClone(store[0]!);
      if(kind==="badId")row.id="";
      if(kind==="badDate")row.date=new Date("invalid");
      if(kind==="outOfRange")row.date=new Date("2026-10-31T00:00:00.000Z");
      if(kind==="badPublished")
        row.isPublished="true" as unknown as boolean;
      if(kind==="badBundleId")row.bundle.id="";
      if(kind==="badStepCount")row.bundle.stepLinks=null as unknown as Stored["bundle"]["stepLinks"];
      if(kind==="badCreator")row.createdBy.username=undefined as unknown as string;
      if(kind==="badOrder"){
        m.schedules.mockResolvedValueOnce([store[0],store[2]]);
      } else m.schedules.mockResolvedValueOnce([row]);
      const r=await send("ADMIN");
      expect(r.status).toBe(500);headers(r);
      expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
      noWrites();
    });
});
