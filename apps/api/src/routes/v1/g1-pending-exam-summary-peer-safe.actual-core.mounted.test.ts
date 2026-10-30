/**
 * AG1 cont138 targeted source proof only, independent of peer-owned
 * route/app files: signed JWT -> REGISTERED Hono -> ACTUAL unmocked
 * Core getPendingExamResults -> synthetic Prisma examResult.findMany.
 * NO Core mock, real SQL/browser/socket/provider/notes/review/writes.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const store=vi.hoisted(()=>({
  find:vi.fn(),user:vi.fn(),registration:vi.fn(),write:vi.fn(),
  rateKeys:[] as string[],limited:false,
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(v:{windowMs:number}){this.windowMs=v.windowMs;}
    async increment(key:string){
      store.rateKeys.push(key);
      return {totalHits:store.limited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{...actual.prisma,
    examResult:{...actual.prisma.examResult,
      findMany:store.find,create:store.write,
      update:store.write,delete:store.write},
    user:{...actual.prisma.user,findUnique:store.user},
    $transaction:store.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:store.registration,
}));
// No @gafus/core/services/exam mock.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {getPendingExamResults} from "@gafus/core/services/exam";

const PATH="/api/v1/trainer/exam-results/pending-summary";
const SECRET="PRIVATE_STUDENT_EMAIL_AND_WRITTEN_FEEDBACK_VIDEO_TEST_ANSWERS";
const actors={
  A:{id:"pending-trainer-A",username:"trainer-a",role:"TRAINER"},
  B:{id:"pending-trainer-B",username:"trainer-b",role:"TRAINER"},
  MOD:{id:"pending-moderator",username:"moderator",role:"MODERATOR"},
  ADMIN:{id:"pending-admin",username:"admin",role:"ADMIN"},
  USER:{id:"pending-user",username:"user",role:"USER"},
  PARTNER:{id:"pending-partner",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
type Source={
  id:string;createdAt:Date;testAnswers:unknown;testScore:number;
  testMaxScore:number;videoReportUrl:string;writtenFeedback:string;
  userStep:{id:string;status:"IN_PROGRESS"|"COMPLETED";
    userTraining:{user:{username:string};
      dayOnCourse:{course:{name:string;authorId:string};day:{title:string}}};
    stepOnDay:{step:{title:string;hasTestQuestions:boolean;
      requiresWrittenFeedback:boolean;requiresVideoReport:boolean;
      checklist:string}};
  }|null;
};
const item=(key:string,authorId:string,stamp:string,flags:[boolean,boolean,boolean],
  status:"IN_PROGRESS"|"COMPLETED"="IN_PROGRESS"):Source=>({
  id:key,createdAt:new Date(stamp),testAnswers:{private:SECRET},
  testScore:8,testMaxScore:10,videoReportUrl:SECRET,writtenFeedback:SECRET,
  userStep:{id:"userstep-"+key,status,
    userTraining:{user:{username:SECRET},
      dayOnCourse:{course:{name:"Course "+key,authorId},day:{title:"Day "+key}}},
    stepOnDay:{step:{title:"Step "+key,hasTestQuestions:flags[0],
      requiresWrittenFeedback:flags[1],requiresVideoReport:flags[2],
      checklist:SECRET}},
  },
});
const fixtures:Source[]=[
  item("a-written",actors.A.id,"2026-10-21T15:00:00Z",[true,true,false]),
  item("b-video",actors.B.id,"2026-10-22T08:00:00Z",[false,false,true]),
  item("mod-own",actors.MOD.id,"2026-10-19T09:00:00Z",[false,true,true]),
  item("a-test-only",actors.A.id,"2026-10-23T09:00:00Z",[true,false,false]),
  item("a-completed",actors.A.id,"2026-10-24T09:00:00Z",[true,true,false],"COMPLETED"),
  item("a-tie",actors.A.id,"2026-10-21T15:00:00Z",[false,true,false]),
];
type Query={where:{
  userStep:{status:string;stepOnDay:{step:{NOT:Record<string,boolean>}};
    userTraining:{dayOnCourse:{course:{authorId?:string}}}};
  };
  orderBy:{createdAt:string};include:unknown};
const send=(who:string,suffix="",method="GET")=>app.request(PATH+suffix,{
  method,headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
});
function privateHeaders(r:Response){
  const cc=(r.headers.get("cache-control")??"").toLowerCase();
  expect(cc).toContain("private");expect(cc).toContain("no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
}
function neverWrote(){expect(store.write).not.toHaveBeenCalled();}
type Summary={id:string;stepTitle:string;courseName:string;dayTitle:string;
  hasTestQuestions:boolean;hasWrittenFeedback:boolean;
  hasVideoReport:boolean;submittedAt:string};
const fields=[
  "courseName","dayTitle","hasTestQuestions","hasVideoReport",
  "hasWrittenFeedback","id","stepTitle","submittedAt",
];
function summary(json:unknown):Summary[]{
  const body=json as {success:boolean;data:Summary[]};
  expect(Object.keys(body).sort()).toEqual(["data","success"]);
  expect(body.success).toBe(true);
  for(const row of body.data){
    expect(Object.keys(row).sort()).toEqual(fields);
    expect(row.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
  const encoded=JSON.stringify(body);
  expect(encoded).not.toContain(SECRET);
  expect(encoded).not.toContain("userstep-");
  expect(encoded).not.toContain("studentUsername");
  expect(encoded).not.toContain("testScore");
  expect(encoded).not.toContain("writtenFeedback");
  expect(encoded).not.toContain("videoReportUrl");
  return body.data;
}
function checkQuery(owner?:string){
  expect(store.find).toHaveBeenCalledTimes(1);
  const q=store.find.mock.calls[0]![0] as Query;
  expect(q.orderBy).toEqual({createdAt:"desc"});
  expect(q.where.userStep.status).toBe("IN_PROGRESS");
  expect(q.where.userStep.stepOnDay.step.NOT).toEqual({
    hasTestQuestions:true,requiresVideoReport:false,
    requiresWrittenFeedback:false,
  });
  expect(q.where.userStep.userTraining.dayOnCourse.course)
    .toEqual(owner?{authorId:owner}:{});
  expect(q.include).toHaveProperty("userStep.include.userTraining.include.user");
  expect(q.include).toHaveProperty("userStep.include.stepOnDay.include.step");
}
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [key,actor] of Object.entries(actors))
    jwt[key]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();store.limited=false;store.rateKeys.length=0;
  store.registration.mockResolvedValue(true);
  store.user.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  store.find.mockImplementation(async(q:Query)=>{
    const owner=q.where.userStep.userTraining.dayOnCourse.course.authorId;
    return fixtures.filter(f=>{
      if(f.userStep?.status!=="IN_PROGRESS")return false;
      const step=f.userStep.stepOnDay.step;
      if(step.hasTestQuestions&&!step.requiresVideoReport&&!step.requiresWrittenFeedback)
        return false;
      return !owner||f.userStep.userTraining.dayOnCourse.course.authorId===owner;
    }).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
  });
});
describe("AG1 cont138 registered Hono -> ACTUAL pending exams Core",()=>{
  it("ACTUAL Core + TRAINER A→B→A scoped regular-only list and DTO",async()=>{
    expect(typeof getPendingExamResults).toBe("function");
    for(const [who,expected] of [
      ["A",["a-tie","a-written"]],
      ["B",["b-video"]],
      ["A",["a-tie","a-written"]],
    ] as const){
      store.find.mockClear();
      const r=await send(who);expect(r.status).toBe(200);privateHeaders(r);
      const rows=summary(await r.json());
      expect(rows.map(row=>row.id)).toEqual(expected);
      expect(rows.every(row=>!row.id.includes("completed")&&!row.id.includes("test-only")))
        .toBe(true);
      checkQuery(actors[who].id);neverWrote();
    }
  });
  it("ADMIN elevated sees all author courses, still no pure test/completed",async()=>{
    const r=await send("ADMIN");expect(r.status).toBe(200);privateHeaders(r);
    const rows=summary(await r.json());
    expect(rows.map(row=>row.id)).toEqual([
      "b-video","a-tie","a-written","mod-own",
    ]);
    checkQuery();neverWrote();
  });
  it("MODERATOR permitted by existing Next role but only OWN authored courses",async()=>{
    const r=await send("MOD");expect(r.status).toBe(200);privateHeaders(r);
    const rows=summary(await r.json());
    expect(rows.map(row=>row.id)).toEqual(["mod-own"]);
    checkQuery(actors.MOD.id);neverWrote();
  });
  it("no daily-course second query; only ordinary pending Core SELECT",async()=>{
    const r=await send("ADMIN");expect(r.status).toBe(200);
    summary(await r.json());checkQuery();neverWrote();
  });
  it("legitimate true empty -> 200 []",async()=>{
    store.find.mockResolvedValue([]);
    const r=await send("A");expect(r.status).toBe(200);privateHeaders(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    checkQuery(actors.A.id);neverWrote();
  });
  it.each(["USER","PARTNER"] as const)(
    "%s forbidden403 before Core",async who=>{
      const r=await send(who);expect(r.status).toBe(403);privateHeaders(r);
      expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
      expect(store.find).not.toHaveBeenCalled();neverWrote();
    });
  it.each(["","not-a-token"])("guest or bad JWT401 %s",async who=>{
    const r=await send(who);expect(r.status).toBe(401);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"UNAUTHORIZED"});
    expect(store.find).not.toHaveBeenCalled();
    expect(store.rateKeys).toHaveLength(0);neverWrote();
  });
  it("pending registration401 before Core",async()=>{
    store.registration.mockResolvedValueOnce(false);
    const r=await send("A");expect(r.status).toBe(401);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(store.find).not.toHaveBeenCalled();neverWrote();
  });
  it("existing limiter429 pre-Core and private",async()=>{
    store.limited=true;
    const r=await send("A");expect(r.status).toBe(429);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"RATE_LIMITED"});
    expect(store.find).not.toHaveBeenCalled();neverWrote();
  });
  it.each(["?authorId=pending-trainer-B","?role=ADMIN","?includeStudents=1",
    "?scope=all","?x=1&x=2","?review=true"] as const)(
    "malformed/override query %s rejected400",async q=>{
      const r=await send("A",q);expect(r.status).toBe(400);privateHeaders(r);
      expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
      expect(store.find).not.toHaveBeenCalled();neverWrote();
    });
  it("POST not a review/write route",async()=>{
    const r=await send("A","","POST");
    expect([404,405]).toContain(r.status);
    expect(store.find).not.toHaveBeenCalled();neverWrote();
  });
  it("Core/Prisma throw => generic500 not false empty200",async()=>{
    store.find.mockRejectedValueOnce(new Error(SECRET));
    const r=await send("A");expect(r.status).toBe(500);privateHeaders(r);
    const raw=await r.json();
    expect(raw).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    expect(JSON.stringify(raw)).not.toContain(SECRET);neverWrote();
  });
  it.each(["invalidSubmitted","missingStep","missingCourse","badFlag"] as const)(
    "corrupt Core mapped %s => masked500",async which=>{
      const fixture=structuredClone(fixtures[0]!);
      if(which==="invalidSubmitted")fixture.createdAt=new Date("bad");
      if(which==="missingStep")
        (fixture.userStep as {stepOnDay:{step:unknown}}).stepOnDay.step=null;
      if(which==="missingCourse")
        (fixture.userStep as {userTraining:{dayOnCourse:{course:unknown}}})
          .userTraining.dayOnCourse.course=null;
      if(which==="badFlag")
        (fixture.userStep as {stepOnDay:{step:{requiresVideoReport:unknown}}})
          .stepOnDay.step.requiresVideoReport="nope";
      store.find.mockResolvedValue([fixture]);
      const r=await send("A");expect(r.status).toBe(500);privateHeaders(r);
      expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
      neverWrote();
    });
});
