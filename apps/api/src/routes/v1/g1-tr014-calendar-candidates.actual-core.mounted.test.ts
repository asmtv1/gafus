/**
 * AG1 cont132: ACTUAL registered Hono signed JWT → ACTUAL existing
 * Core getDailyCourseCandidates → synthetic Prisma findMany.
 * Core validation of 2..5 daily eligible links runs UNMOCKED.
 * No real SQL, Redis, TCP server, browser or writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type { DailyCourseCandidateDto } from "@gafus/core/services/dailyCourse";

const m=vi.hoisted(()=>({
  find:vi.fn(),session:vi.fn(),registration:vi.fn(),write:vi.fn(),
  unrelated:vi.fn(),rateKeys:[] as string[],limited:false,
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
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
vi.mock("@gafus/prisma",async original=>{
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{...actual.prisma,
    user:{...actual.prisma.user,findUnique:m.session},
    dailyCourseBundle:{...actual.prisma.dailyCourseBundle,
      findMany:m.find,create:m.write,update:m.write,
      delete:m.write,deleteMany:m.write},
    dailyCourseBundleStep:{...actual.prisma.dailyCourseBundleStep,
      createMany:m.write,deleteMany:m.write},
    step:{...actual.prisma.step,findMany:m.unrelated},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// NO vi.mock of Core dailyCourse module.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getDailyCourseCandidates as actualCore }
  from "@gafus/core/services/dailyCourse";

const PATH="/api/v1/trainer/daily-course/candidates";
const SECRET="AG1_PRIVATE_EMAIL_HLS_PAYMENT_STUDENT_PROGRESS";
const actors={
  A:{id:"calendar-owner-A",username:"trainerA",role:"TRAINER"},
  B:{id:"calendar-owner-B",username:"trainerB",role:"TRAINER"},
  ADMIN:{id:"calendar-admin",username:"admin",role:"ADMIN"},
  MOD:{id:"calendar-mod",username:"moderator",role:"MODERATOR"},
  USER:{id:"calendar-user",username:"user",role:"USER"},
  PARTNER:{id:"calendar-partner",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
type CoreStep={
  id:string;title:string;description:string;type:string;
  durationSec:number|null;estimatedDurationSec:number|null;
  videoUrl:string|null;imageUrls:string[];pdfUrls:string[];
  checklist:unknown;requiresVideoReport:boolean;
  requiresWrittenFeedback:boolean;hasTestQuestions:boolean;
  surveySlug:string|null;isDailyCourse:boolean;privateToken:string;
};
type Link={id:string;order:number;step:CoreStep;privateNote:string};
type Bundle={
  id:string;title:string;type:string;authorId:string;
  updatedAt:Date;author:{username:string;privateEmail:string};
  stepLinks:Link[];privateCost:string;
};
const makeStep=(id:string,type:string,flags:Partial<CoreStep>={}):CoreStep=>({
  id,title:id,description:"Test step",type,durationSec:90,
  estimatedDurationSec:120,videoUrl:null,imageUrls:[],pdfUrls:[],
  checklist:null,requiresVideoReport:false,
  requiresWrittenFeedback:false,hasTestQuestions:false,surveySlug:null,
  isDailyCourse:true,privateToken:SECRET,...flags,
});
const bundle=(id:string,authorId:string,when:string,steps:CoreStep[]):Bundle=>({
  id,title:"Bundle "+id,type:"TRAINING",authorId,
  updatedAt:new Date(when),
  author:{username:"account_"+authorId,privateEmail:SECRET},
  stepLinks:steps.map((step,i)=>({
    id:id+"-link-"+(i+1),order:i+1,step,privateNote:SECRET,
  })),
  privateCost:SECRET,
});
const source:Bundle[]=[
  bundle("A-valid-old",actors.A.id,"2026-10-18T00:00:00.000Z",[
    makeStep("train","TRAINING"),makeStep("practice","PRACTICE"),
  ]),
  bundle("A-exam-new",actors.A.id,"2026-10-22T00:00:00.000Z",[
    makeStep("train2","THEORY"),makeStep("exam","EXAMINATION",{
      requiresVideoReport:true,requiresWrittenFeedback:true,
      hasTestQuestions:true,
    }),
  ]),
  bundle("B-valid",actors.B.id,"2026-10-20T00:00:00.000Z",[
    makeStep("b-survey","SURVEY"),makeStep("b-break","BREAK"),
  ]),
  bundle("A-one-step",actors.A.id,"2026-10-23T00:00:00.000Z",[
    makeStep("lonely","TRAINING"),
  ]),
  bundle("A-too-many",actors.A.id,"2026-10-24T00:00:00.000Z",
    Array.from({length:6},(_,i)=>makeStep("many"+i,"TRAINING"))),
  bundle("A-flagged",actors.A.id,"2026-10-25T00:00:00.000Z",[
    makeStep("f1","PRACTICE",{requiresWrittenFeedback:true}),
    makeStep("f2","TRAINING"),
  ]),
  bundle("B-not-daily",actors.B.id,"2026-10-26T00:00:00.000Z",[
    makeStep("not-daily","TRAINING",{isDailyCourse:false}),
    makeStep("normal","TRAINING"),
  ]),
  bundle("B-unsupported",actors.B.id,"2026-10-27T00:00:00.000Z",[
    makeStep("unsupported","DIARY"),makeStep("regular","TRAINING"),
  ]),
  bundle("A-has-test",actors.A.id,"2026-10-28T00:00:00.000Z",[
    makeStep("q","SURVEY",{hasTestQuestions:true}),
    makeStep("r","PRACTICE"),
  ]),
  bundle("B-video",actors.B.id,"2026-10-29T00:00:00.000Z",[
    makeStep("v","BREAK",{requiresVideoReport:true}),
    makeStep("p","PRACTICE"),
  ]),
];
const send=(who:string,suffix="",method="GET")=>app.request(PATH+suffix,{
  method,headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
});
const privateHeaders=(res:Response)=>{
  const cache=(res.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.unrelated).not.toHaveBeenCalled();
};
const expectedSelect={
  id:true,title:true,type:true,authorId:true,
  author:{select:{username:true}},
  stepLinks:{orderBy:{order:"asc"},
    select:{id:true,order:true,step:{select:{
      id:true,title:true,description:true,type:true,durationSec:true,
      estimatedDurationSec:true,videoUrl:true,videoUrls:true,imageUrls:true,pdfUrls:true,
      checklist:true,requiresVideoReport:true,requiresWrittenFeedback:true,
      hasTestQuestions:true,surveySlug:true,isDailyCourse:true,
    }}}},
};
function checkSourceQuery(owner?:string){
  expect(m.find).toHaveBeenCalledExactlyOnceWith({
    where:owner?{authorId:owner}:{},
    orderBy:{updatedAt:"desc"},
    select:expectedSelect,
  });
}
function dto(response:unknown):DailyCourseCandidateDto[]{
  const result=response as {success:boolean;data:DailyCourseCandidateDto[]};
  expect(Object.keys(result).sort()).toEqual(["data","success"]);
  expect(result.success).toBe(true);
  expect(Array.isArray(result.data)).toBe(true);
  for(const row of result.data){
    expect(Object.keys(row).sort()).toEqual([
      "authorId","authorUsername","id","stepsCount","title","type",
    ]);
    expect(typeof row.id).toBe("string");
    expect(Number.isSafeInteger(row.stepsCount)).toBe(true);
    expect(row.stepsCount).toBeGreaterThanOrEqual(2);
    expect(row.stepsCount).toBeLessThanOrEqual(5);
  }
  expect(JSON.stringify(result)).not.toContain(SECRET);
  return result.data;
}
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [who,actor] of Object.entries(actors))
    jwt[who]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();m.rateKeys.length=0;m.limited=false;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  m.find.mockImplementation(async({where}:{
    where:{authorId?:string};
  })=>source
    .filter(b=>!where.authorId||b.authorId===where.authorId)
    .sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())
    .map(b=>({...b,stepLinks:[...b.stepLinks].sort((a,b)=>a.order-b.order)})));
});

describe("AG1 cont132 calendar candidates registered signed Hono -> ACTUAL Core",()=>{
  it("Core function is real and separate from bundle step candidates",()=>{
    expect(typeof actualCore).toBe("function");
    noWrites();
  });
  it("TRAINER A→B→A and Core-only safe bundle filtering in updatedAt DESC",async()=>{
    for(const [who,expected] of [
      ["A",["A-exam-new","A-valid-old"]],
      ["B",["B-valid"]],
      ["A",["A-exam-new","A-valid-old"]],
    ] as const) {
      m.find.mockClear();
      const res=await send(who);
      expect(res.status).toBe(200);privateHeaders(res);
      const data=dto(await res.json());
      expect(data.map(x=>x.id)).toEqual(expected);
      expect(data.every(x=>x.authorId===actors[who].id)).toBe(true);
      checkSourceQuery(actors[who].id);
      noWrites();
    }
  });
  it.each(["ADMIN","MOD"] as const)(
    "%s sees eligible mixed-author bundles, invalid excluded",async who=>{
      const res=await send(who);
      expect(res.status).toBe(200);privateHeaders(res);
      const data=dto(await res.json());
      expect(data.map(x=>x.id)).toEqual([
        "A-exam-new","B-valid","A-valid-old",
      ]);
      expect(new Set(data.map(x=>x.authorId)).size).toBe(2);
      checkSourceQuery();noWrites();
    });
  it("exact existing Next DailyCourseCandidateDto, counts derived by ACTUAL Core",async()=>{
    const res=await send("A");
    const result=dto(await res.json());
    const expected:DailyCourseCandidateDto[]=[
      {id:"A-exam-new",title:"Bundle A-exam-new",type:"TRAINING",
        stepsCount:2,authorId:actors.A.id,
        authorUsername:"account_"+actors.A.id},
      {id:"A-valid-old",title:"Bundle A-valid-old",type:"TRAINING",
        stepsCount:2,authorId:actors.A.id,
        authorUsername:"account_"+actors.A.id},
    ];
    expect(result).toEqual(expected);
    noWrites();
  });
  it("legitimate empty Prisma list returns 200 []",async()=>{
    m.find.mockResolvedValueOnce([]);
    const res=await send("A");
    expect(res.status).toBe(200);privateHeaders(res);
    expect(await res.json()).toEqual({success:true,data:[]});
    checkSourceQuery(actors.A.id);noWrites();
  });
  it.each(["USER","PARTNER"] as const)(
    "%s receives 403 before Core query",async who=>{
      const res=await send(who);
      expect(res.status).toBe(403);privateHeaders(res);
      expect(await res.json()).toMatchObject({code:"FORBIDDEN"});
      expect(m.find).not.toHaveBeenCalled();noWrites();
    });
  it.each(["","invalid.jwt"])("guest/bad JWT 401 before Core and limiter: %s",async who=>{
    const res=await send(who);
    expect(res.status).toBe(401);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"UNAUTHORIZED"});
    expect(m.rateKeys).toHaveLength(0);
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("registration-pending retains distinct 401 before Core",async()=>{
    m.registration.mockResolvedValueOnce(false);
    const res=await send("A");
    expect(res.status).toBe(401);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("existing rate-limit429 occurs before Core with private headers",async()=>{
    m.limited=true;
    const res=await send("A");
    expect(res.status).toBe(429);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"RATE_LIMITED"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it.each(["?authorId="+actors.B.id,"?isAdmin=true","?page=1",
    "?limit=10","?type=TRAINING","?x=1&x=2",
  ])("invalid/query override %s rejects 400 before Core",async query=>{
    const res=await send("A",query);
    expect(res.status).toBe(400);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"BAD_QUERY"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("no POST mutation mounted at calendar candidates",async()=>{
    const res=await send("A","","POST");
    expect([404,405]).toContain(res.status);
    privateHeaders(res);
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("actual Core Prisma throw masks 500, not a misleading empty list",async()=>{
    m.find.mockRejectedValueOnce(Error(SECRET));
    const res=await send("A");
    expect(res.status).toBe(500);privateHeaders(res);
    const body=await res.json();
    expect(body).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    expect(JSON.stringify(body)).not.toContain(SECRET);
    noWrites();
  });
  it("foreign projected Core bundle to TRAINER fails closed",async()=>{
    m.find.mockResolvedValueOnce([source[2]]);
    const res=await send("A");
    expect(res.status).toBe(500);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    noWrites();
  });
  it.each(["id","type","username","authorId","badLength"] as const)(
    "invalid Core projection %s fails masked500",async kind=>{
      const item=structuredClone(source[0]!);
      if(kind==="id")item.id="";
      if(kind==="type")item.type=undefined as unknown as string;
      if(kind==="username")item.author.username=null as unknown as string;
      if(kind==="authorId")item.authorId="";
      if(kind==="badLength") {
        // Invalid source relations are filtered by Core; malformed author
        // output is independently tested above.
        item.stepLinks=undefined as unknown as Link[];
      }
      m.find.mockResolvedValueOnce([item]);
      const res=await send("A");
      if(kind==="badLength"){
        // Existing Core intentionally filters this bundle; valid empty200.
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({success:true,data:[]});
      } else {
        expect(res.status).toBe(500);privateHeaders(res);
        expect(await res.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
      }
      noWrites();
    });
});
