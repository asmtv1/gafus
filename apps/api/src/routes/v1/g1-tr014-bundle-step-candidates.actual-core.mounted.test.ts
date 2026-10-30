/**
 * AG1 cont130: registered signed Hono -> ACTUAL Core
 * getDailyCourseBundleStepCandidates -> synthetic Prisma. One acceptance suite.
 * No Core mock, real PG, Redis, HTTP socket or write operations.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type { DailyCourseStepCandidateDto } from
  "@gafus/core/services/dailyCourse";

const m = vi.hoisted(() => ({
  find: vi.fn(), authSession: vi.fn(), registration: vi.fn(), writes: vi.fn(),
  otherRead: vi.fn(), rateKeys: [] as string[], limited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs=60_000;
    init(options:{windowMs:number}){this.windowMs=options.windowMs;}
    async increment(key:string){
      m.rateKeys.push(key);
      return {totalHits:m.limited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma", async original => {
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{...actual.prisma,
    user:{...actual.prisma.user,findUnique:m.authSession},
    step:{...actual.prisma.step,
      findMany:m.find,create:m.writes,update:m.writes,
      updateMany:m.writes,delete:m.writes,deleteMany:m.writes},
    dailyCourseBundle:{...actual.prisma.dailyCourseBundle,
      findMany:m.otherRead,create:m.writes,update:m.writes},
    $transaction:m.writes,
  }};
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// NEVER vi.mock @gafus/core/services/dailyCourse.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getDailyCourseBundleStepCandidates as actualCore } from
  "@gafus/core/services/dailyCourse";
import { TR014_PROPOSED_PATH, bundleSchema } from
  "../../../../../apps/trainer-panel/src/trainer-vite/tr014DailyBundlesRead20261022";

const PATH="/api/v1/trainer/daily-course/bundle-step-candidates";
const PRIVATE="AG1_HIDDEN_STEP_MEDIA_PERSONAL_EMAIL_CANDIDATE_SECRET";
const actor={
  A:{id:"ag1-bsc-trainer-a",username:"tra",role:"TRAINER"},
  B:{id:"ag1-bsc-trainer-b",username:"trb",role:"TRAINER"},
  ADMIN:{id:"ag1-bsc-admin",username:"adm",role:"ADMIN"},
  MOD:{id:"ag1-bsc-mod",username:"mod",role:"MODERATOR"},
  USER:{id:"ag1-bsc-user",username:"usr",role:"USER"},
  PARTNER:{id:"ag1-bsc-partner",username:"prtn",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
type Stored={
  id:string;title:string;type:string;durationSec:number|null;
  authorId:string;updatedAt:Date;isDailyCourse:boolean;
  requiresVideoReport:boolean;requiresWrittenFeedback:boolean;
  hasTestQuestions:boolean;studentPrivate:string;
  author:{username:string;privateEmail:string};
};
const make=(id:string,owner:string,type:string,date:string,other:Partial<Stored>={}):Stored=>({
  id,title:"Step "+id,type,durationSec:90,authorId:owner,
  updatedAt:new Date(date),isDailyCourse:true,
  requiresVideoReport:false,requiresWrittenFeedback:false,
  hasTestQuestions:false,studentPrivate:PRIVATE,
  author:{username:"account_"+owner,privateEmail:PRIVATE},...other,
});
const rows:Stored[]=[
  make("A-training",actor.A.id,"TRAINING","2026-10-19T00:00:00.000Z"),
  make("A-exam",actor.A.id,"EXAMINATION","2026-10-22T00:00:00.000Z",{
    requiresVideoReport:true,requiresWrittenFeedback:true,
    hasTestQuestions:true,durationSec:null,
  }),
  make("A-flagged",actor.A.id,"PRACTICE","2026-10-23T00:00:00.000Z",{
    requiresVideoReport:true,
  }),
  make("A-not-daily",actor.A.id,"PRACTICE","2026-10-24T00:00:00.000Z",{
    isDailyCourse:false,
  }),
  make("B-survey",actor.B.id,"SURVEY","2026-10-21T00:00:00.000Z"),
  make("B-feedback",actor.B.id,"THEORY","2026-10-20T00:00:00.000Z",{
    requiresWrittenFeedback:true,
  }),
  make("B-test",actor.B.id,"BREAK","2026-10-20T01:00:00.000Z",{
    hasTestQuestions:true,
  }),
];

const send=(who:string,suffix="",method="GET")=>
  app.request(PATH+suffix,{
    method,headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
  });
const headers=(r:Response)=>{
  const cache=(r.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
function noWrites(){
  expect(m.writes).not.toHaveBeenCalled();
  expect(m.otherRead).not.toHaveBeenCalled();
}
type CoreQuery={
  where:{authorId?:string;isDailyCourse:boolean;
    OR:[{type:{in:string[]};requiresVideoReport:boolean;
      requiresWrittenFeedback:boolean;hasTestQuestions:boolean},{type:string}]};
  orderBy:{updatedAt:string};select:unknown;
};
const filter=(query:CoreQuery):Stored[]=>rows
  .filter(row=>{
    if(query.where.authorId && row.authorId!==query.where.authorId)return false;
    if(row.isDailyCourse!==query.where.isDailyCourse)return false;
    return query.where.OR.some(rule=>{
      if ("requiresVideoReport" in rule) {
        return rule.type.in.includes(row.type) &&
          row.requiresVideoReport===rule.requiresVideoReport &&
          row.requiresWrittenFeedback===rule.requiresWrittenFeedback &&
          row.hasTestQuestions===rule.hasTestQuestions;
      }
      return row.type===rule.type;
    });
  })
  .sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime());

const expectedWhere=(authorId?:string)=>({
  ...(authorId?{authorId}:{}),isDailyCourse:true,
  OR:[
    {type:{in:["TRAINING","PRACTICE","THEORY","BREAK","SURVEY"]},
      requiresVideoReport:false,requiresWrittenFeedback:false,
      hasTestQuestions:false},
    {type:"EXAMINATION"},
  ],
});
const expectedSelect={
  id:true,title:true,type:true,durationSec:true,authorId:true,
  author:{select:{username:true}},
};
const assertQuery=(owner?:string)=>{
  expect(m.find).toHaveBeenCalledExactlyOnceWith({
    where:expectedWhere(owner),orderBy:{updatedAt:"desc"},
    select:expectedSelect,
  });
};
function dto(body:unknown):DailyCourseStepCandidateDto[]{
  expect(body).toMatchObject({success:true});
  expect(Object.keys(body as object).sort()).toEqual(["data","success"]);
  const data=(body as {data:unknown}).data;
  expect(Array.isArray(data)).toBe(true);
  for(const x of data as Record<string,unknown>[]){
    expect(Object.keys(x).sort()).toEqual([
      "authorId","authorUsername","durationSec","id","title","type",
    ]);
    expect(typeof x.id).toBe("string");
    expect(typeof x.authorUsername).toBe("string");
    expect(x.durationSec===null ||
      typeof x.durationSec==="number").toBe(true);
  }
  expect(JSON.stringify(body)).not.toContain(PRIVATE);
  return data as DailyCourseStepCandidateDto[];
}

beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [label,value] of Object.entries(actor))
    jwt[label]=await generateAccessToken(value);
});
beforeEach(()=>{
  vi.clearAllMocks();m.limited=false;m.rateKeys.length=0;
  m.registration.mockResolvedValue(true);
  m.authSession.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const matched = Object.values(actor).find((candidate) => candidate.id === where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
  m.find.mockImplementation(async(query:CoreQuery)=>
    filter(query).map(x=>({...x})));
});

describe("AG1 TR014 bundle-step-candidates registered Hono -> actual Core -> Prisma",()=>{
  it("existing real Core bound, existing sibling bundles path unchanged",()=>{
    expect(typeof actualCore).toBe("function");
    expect(TR014_PROPOSED_PATH).toBe("/api/v1/trainer/daily-course/bundles");
    expect(typeof bundleSchema.parse).toBe("function");
  });
  it("TRAINER A->B->A, exact Core SQL args, examined flag policy, owner",async()=>{
    for(const [who,want] of [
      ["A",["A-exam","A-training"]],
      ["B",["B-survey"]],
      ["A",["A-exam","A-training"]],
    ] as const){
      m.find.mockClear();
      const r=await send(who);
      expect(r.status).toBe(200);headers(r);
      const result=dto(await r.json());
      expect(result.map(x=>x.id)).toEqual(want);
      expect(result.every(x=>x.authorId===actor[who].id)).toBe(true);
      if(who==="A")
        expect(result.find(x=>x.id==="A-exam")?.durationSec).toBeNull();
      assertQuery(actor[who].id);noWrites();
    }
  });
  it.each(["ADMIN","MOD"] as const)(
    "%s sees all eligible authors in updatedAt DESC",async who=>{
      const r=await send(who);
      expect(r.status).toBe(200);headers(r);
      const result=dto(await r.json());
      expect(result.map(x=>x.id)).toEqual([
        "A-exam","B-survey","A-training",
      ]);
      expect(new Set(result.map(x=>x.authorId)).size).toBe(2);
      assertQuery();noWrites();
    });
  it("Next page frozen return type is same six-field DTO",async()=>{
    const r=await send("A");
    const result=dto(await r.json());
    const expected:DailyCourseStepCandidateDto[]=[
      {id:"A-exam",title:"Step A-exam",type:"EXAMINATION",
        durationSec:null,authorId:actor.A.id,
        authorUsername:"account_"+actor.A.id},
      {id:"A-training",title:"Step A-training",type:"TRAINING",
        durationSec:90,authorId:actor.A.id,
        authorUsername:"account_"+actor.A.id},
    ];
    expect(result).toEqual(expected);
    expect(result).toHaveLength(2);
    noWrites();
  });
  it("genuine empty Prisma source => 200 []",async()=>{
    m.find.mockResolvedValueOnce([]);
    const r=await send("A");
    expect(r.status).toBe(200);headers(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    assertQuery(actor.A.id);noWrites();
  });
  it.each(["USER","PARTNER"] as const)(
    "%s blocked 403 before Core",async who=>{
      const r=await send(who);
      expect(r.status).toBe(403);headers(r);
      expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
      expect(m.find).not.toHaveBeenCalled();noWrites();
    });
  it.each(["","invalid.jwt"])("guest/bad signed JWT 401 %s",async who=>{
    const r=await send(who);
    expect(r.status).toBe(401);headers(r);
    expect(await r.json()).toMatchObject({code:"UNAUTHORIZED"});
    expect(m.rateKeys).toHaveLength(0);
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("registration pending remains 401 before Core",async()=>{
    m.registration.mockResolvedValueOnce(false);
    const r=await send("A");
    expect(r.status).toBe(401);headers(r);
    expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("rate limiter429 before Core, private headers",async()=>{
    m.limited=true;
    const r=await send("A");
    expect(r.status).toBe(429);headers(r);
    expect(await r.json()).toMatchObject({code:"RATE_LIMITED"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it.each(["?authorId="+actor.B.id,"?isAdmin=true","?isPublic=false",
    "?page=1","?x=1&x=2","?type=EXAMINATION",
  ])("invalid/override query %s ->400 before Core",async query=>{
    const r=await send("A",query);
    expect(r.status).toBe(400);headers(r);
    expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("no write route on new path",async()=>{
    const r=await send("A","","POST");
    expect([404,405]).toContain(r.status);
    headers(r);noWrites();
    expect(m.find).not.toHaveBeenCalled();
  });
  it("DB throw -> masked 500, never false empty []",async()=>{
    m.find.mockRejectedValueOnce(Error(PRIVATE));
    const r=await send("A");
    expect(r.status).toBe(500);headers(r);
    const body=await r.json();
    expect(body).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    expect(JSON.stringify(body)).not.toContain(PRIVATE);noWrites();
  });
  it("wrong foreign Core projection for TRAINER fails closed 500",async()=>{
    m.find.mockResolvedValueOnce([rows[4]]);
    const r=await send("A");
    expect(r.status).toBe(500);headers(r);
    expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    noWrites();
  });
  it.each(["badId","badDuration","badType","badOwner","badUsername"] as const)(
    "corrupt Core projection %s -> masked500 without PII",async kind=>{
      const item=structuredClone(rows[0]!);
      if(kind==="badId")item.id="";
      if(kind==="badDuration")item.durationSec=1.5;
      if(kind==="badType")item.type=null as unknown as string;
      if(kind==="badOwner")item.authorId="";
      if(kind==="badUsername")item.author.username=undefined as unknown as string;
      m.find.mockResolvedValueOnce([item]);
      const r=await send("A");
      expect(r.status).toBe(500);headers(r);
      expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
      noWrites();
    });
});
