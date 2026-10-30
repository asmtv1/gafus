/**
 * AG1 cont137 only NEW acceptance:
 * ACTUAL registered Hono signed JWT -> ACTUAL Core getExamResults ->
 * synthetic Prisma two author-owned relation queries. Not real SQL/HTTP
 * socket/browser/provider, no Core mock and no other old suite repeats.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const store=vi.hoisted(()=>({
  find:vi.fn(),session:vi.fn(),registration:vi.fn(),writes:vi.fn(),
  unrelated:vi.fn(),rateHits:[] as string[],blockRate:false,
}));
vi.mock("@hono-rate-limiter/redis",()=>({
 RedisStore:class {
  windowMs=60000;
  init(options:{windowMs:number}){this.windowMs=options.windowMs;}
  async increment(key:string){store.rateHits.push(key);
   return {totalHits:store.blockRate?101:1,
    resetTime:new Date(Date.now()+this.windowMs)};}
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
 },
}));
vi.mock("@gafus/prisma",async original=>{
 const actual=await original<typeof PrismaModule>();
 return {...actual,prisma:{...actual.prisma,
  user:{...actual.prisma.user,findUnique:store.session},
  examResult:{...actual.prisma.examResult,
   findMany:store.find,create:store.writes,update:store.writes,delete:store.writes},
  $transaction:store.writes,
 }};
});
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:store.registration,
}));
// Intentionally ACTUAL getExamResults from @gafus/core/services/exam.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {getExamResults as actualCore} from "@gafus/core/services/exam";

const PATH="/api/v1/trainer/exam-results/summary";
const PRIVATE="AG1_SENTINEL_PRIVATE_STUDENT_EMAIL_MEDIA_TEST_ANSWERS";
const actors={
 A:{id:"ag1-exam-a",username:"trainer-a",role:"TRAINER"},
 B:{id:"ag1-exam-b",username:"trainer-b",role:"TRAINER"},
 ADMIN:{id:"ag1-exam-admin",username:"admin",role:"ADMIN"},
 MOD:{id:"ag1-exam-mod",username:"mod",role:"MODERATOR"},
 USER:{id:"ag1-exam-user",username:"user",role:"USER"},
 PARTNER:{id:"ag1-exam-partner",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
type F={
 id:string;createdAt:Date;updatedAt:Date;
 userStep:unknown;dailyCourseUserStep:unknown;
 isPassed:boolean|null;testAnswers:unknown;testScore:number|null;
 testMaxScore:number|null;videoReportUrl:string|null;
 writtenFeedback:string|null;overallScore:number|null;
 trainerComment:string|null;reviewedAt:Date|null;
 reviewedById:string|null;reviewedBy:unknown;
};
const make=(name:string,owner:string,variant:"regular"|"daily",
 created:string,status:"IN_PROGRESS"|"COMPLETED"|"NOT_STARTED",
 flags:[boolean,boolean,boolean],isPassed:boolean|null):F=>{
 const step={id:"step-"+name,title:"Step "+name,type:"EXAMINATION",
   hasTestQuestions:flags[0],requiresWrittenFeedback:flags[1],
   requiresVideoReport:flags[2],checklist:PRIVATE};
 const user={id:"STUDENT-"+name,username:PRIVATE,profile:{
   fullName:PRIVATE,avatarUrl:PRIVATE},email:PRIVATE};
 const common={id:name,createdAt:new Date(created),updatedAt:new Date(created),
  isPassed,testAnswers:{private:PRIVATE},testScore:75,testMaxScore:100,
  videoReportUrl:PRIVATE,writtenFeedback:PRIVATE,overallScore:76,
  trainerComment:PRIVATE,reviewedAt:new Date(created),
  reviewedById:PRIVATE,reviewedBy:{id:PRIVATE,username:PRIVATE,profile:null}};
 if(variant==="regular"){
  return {...common,dailyCourseUserStep:null,userStep:{
   id:"userstep-"+name,status,
   userTraining:{id:PRIVATE,user,
    dayOnCourse:{id:PRIVATE,day:{id:PRIVATE,title:PRIVATE},
     course:{id:"course-"+name,name:"Course "+name,
      authorId:owner,type:"training"}}},
   stepOnDay:{id:PRIVATE,order:1,step},
  }};
 }
 return {...common,userStep:null,dailyCourseUserStep:{
  id:"daily-step-"+name,status,dailyCourseUserTraining:{
   id:PRIVATE,user,schedule:{id:"schedule-"+name,
    bundle:{id:"bundle-"+name,title:"Daily Bundle "+name,authorId:owner}},
  },bundleStep:{id:"bundle-step-"+name,order:1,step},
 }};
};
const data:F[]=[
 make("a-old",actors.A.id,"regular","2026-10-20T09:00:00Z",
  "COMPLETED",[true,false,false],false),
 make("b-new",actors.B.id,"regular","2026-10-22T09:00:00Z",
  "IN_PROGRESS",[false,true,false],true),
 make("a-daily",actors.A.id,"daily","2026-10-22T12:00:00Z",
  "IN_PROGRESS",[false,false,true],true),
 make("b-daily",actors.B.id,"daily","2026-10-21T08:00:00Z",
  "COMPLETED",[true,true,false],false),
 make("a-tie",actors.A.id,"regular","2026-10-22T12:00:00Z",
  "COMPLETED",[false,true,true],null),
];
type Query={where:Record<string,unknown>;orderBy:{createdAt:string};
  include:unknown};
const send=(who:string,suffix="",method="GET")=>app.request(PATH+suffix,{
 method,headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
});
const assertPrivate=(r:Response)=>{
 const cc=(r.headers.get("cache-control")??"").toLowerCase();
 expect(cc).toContain("private");expect(cc).toContain("no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrite=()=>{
 expect(store.writes).not.toHaveBeenCalled();
 expect(store.unrelated).not.toHaveBeenCalled();
};
const exactFields=[
 "courseName","createdAt","hasTestQuestions","id","requiresVideoReport",
 "requiresWrittenFeedback","status","stepTitle",
];
type Summary={id:string;createdAt:string;courseName:string;stepTitle:string;
 status:"IN_PROGRESS"|"COMPLETED";hasTestQuestions:boolean;
 requiresWrittenFeedback:boolean;requiresVideoReport:boolean};
function exact(json:unknown):Summary[]{
 const body=json as {success:boolean;data:Summary[]};
 expect(Object.keys(body).sort()).toEqual(["data","success"]);
 expect(body.success).toBe(true);
 expect(Array.isArray(body.data)).toBe(true);
 for(const row of body.data){
  expect(Object.keys(row).sort()).toEqual(exactFields);
  expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(["COMPLETED","IN_PROGRESS"]).toContain(row.status);
 }
 const bodyText=JSON.stringify(body);
 expect(bodyText).not.toContain(PRIVATE);
 expect(bodyText).not.toContain("STUDENT-");
 expect(bodyText).not.toContain("userstep-");
 expect(bodyText).not.toContain("bundle-step-");
 return body.data;
}
const checkCoreQueries=(owner?:string)=>{
 expect(store.find).toHaveBeenCalledTimes(2);
 const [normal,daily]=store.find.mock.calls.map((args:unknown[])=>args[0] as Query);
 expect(normal).toMatchObject({
  where:{userStep:{userTraining:{dayOnCourse:{course:
   owner?{authorId:owner}:{} }}}},
  orderBy:{createdAt:"desc"},
 });
 expect(daily).toMatchObject({
  where:{dailyCourseUserStep:{dailyCourseUserTraining:{schedule:{bundle:
   owner?{authorId:owner}:{} }}}},
  orderBy:{createdAt:"desc"},
 });
 // Consumer sources require both complete Core include structures.
 expect(normal.include).toHaveProperty("userStep.include.userTraining.include.user");
 expect(daily.include).toHaveProperty("dailyCourseUserStep.include.bundleStep.include.step");
 expect(JSON.stringify(normal.where)).not.toContain("status");
 expect(JSON.stringify(daily.where)).not.toContain("status");
};
beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 for(const [key,a] of Object.entries(actors))
  jwt[key]=await generateAccessToken(a);
});
beforeEach(()=>{
 vi.clearAllMocks();store.blockRate=false;store.rateHits.length=0;
 store.registration.mockResolvedValue(true);
 store.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
 store.find.mockImplementation(async(query:Query)=>{
  const isRegular="userStep" in query.where;
  const path=isRegular?(query.where.userStep as {
    userTraining:{dayOnCourse:{course:{authorId?:string}}};
   }).userTraining.dayOnCourse.course:
   (query.where.dailyCourseUserStep as {
    dailyCourseUserTraining:{schedule:{bundle:{authorId?:string}}};
   }).dailyCourseUserTraining.schedule.bundle;
  const owner=path.authorId;
  return data.filter(row=>{
   const correct=isRegular?row.userStep!==null:row.dailyCourseUserStep!==null;
   const rowOwner=isRegular?(row.userStep as {
    userTraining:{dayOnCourse:{course:{authorId:string}}};
   }|null)?.userTraining.dayOnCourse.course.authorId:
    (row.dailyCourseUserStep as {
     dailyCourseUserTraining:{schedule:{bundle:{authorId:string}}};
    }|null)?.dailyCourseUserTraining.schedule.bundle.authorId;
   return correct&&(!owner||owner===rowOwner);
  }).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
 });
});
describe("AG1 Trainer exam summary actual registered Hono -> actual Core -> synthetic Prisma",()=>{
 it("actual Core source bound, A→B→A normal + daily author policy and eight fields",async()=>{
  expect(typeof actualCore).toBe("function");
  for(const [who,want] of [
   ["A",["a-daily","a-tie","a-old"]],
   ["B",["b-new","b-daily"]],
   ["A",["a-daily","a-tie","a-old"]],
  ] as const){
   store.find.mockClear();
   const r=await send(who);expect(r.status).toBe(200);assertPrivate(r);
   const rows=exact(await r.json());
   expect(rows.map(x=>x.id)).toEqual(want);
   if(who==="A"){
    expect(rows.find(x=>x.id==="a-daily")).toMatchObject({
     courseName:"Курс дня",status:"IN_PROGRESS",requiresVideoReport:true,
    });
    expect(rows.find(x=>x.id==="a-old")).toMatchObject({
     status:"COMPLETED",hasTestQuestions:true,
    });
   }
   checkCoreQueries(actors[who].id);noWrite();
  }
 });
 it("ADMIN sees both regular and daily both owners in descending order",async()=>{
  const r=await send("ADMIN");expect(r.status).toBe(200);assertPrivate(r);
  const rows=exact(await r.json());
  expect(rows.map(x=>x.id)).toEqual([
   "a-daily","a-tie","b-new","b-daily","a-old",
  ]);
  checkCoreQueries();noWrite();
 });
 it("daily completed despite isPassed false; ordinary pending despite isPassed true",async()=>{
  const rows=exact(await (await send("ADMIN")).json());
  expect(rows.find(x=>x.id==="b-daily")?.status).toBe("COMPLETED");
  expect(rows.find(x=>x.id==="b-new")?.status).toBe("IN_PROGRESS");
  noWrite();
 });
 it("genuine double empty Prisma query -> 200 []",async()=>{
  store.find.mockResolvedValue([]);
  const r=await send("A");expect(r.status).toBe(200);assertPrivate(r);
  expect(await r.json()).toEqual({success:true,data:[]});
  expect(store.find).toHaveBeenCalledTimes(2);noWrite();
 });
 it.each(["MOD","USER","PARTNER"] as const)(
  "%s forbidden before any Core read",async who=>{
   const r=await send(who);expect(r.status).toBe(403);assertPrivate(r);
   expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
   expect(store.find).not.toHaveBeenCalled();noWrite();
  });
 it.each(["","invalid.jwt"])("absent/invalid JWT401 %s",async who=>{
  const r=await send(who);expect(r.status).toBe(401);assertPrivate(r);
  expect(await r.json()).toMatchObject({code:"UNAUTHORIZED"});
  expect(store.find).not.toHaveBeenCalled();noWrite();
 });
 it("pending registration denied before Core",async()=>{
  store.registration.mockResolvedValueOnce(false);
  const r=await send("A");expect(r.status).toBe(401);assertPrivate(r);
  expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
  expect(store.find).not.toHaveBeenCalled();noWrite();
 });
 it("rate429 denied before Core with private headers",async()=>{
  store.blockRate=true;
  const r=await send("A");expect(r.status).toBe(429);assertPrivate(r);
  expect(await r.json()).toMatchObject({code:"RATE_LIMITED"});
  expect(store.find).not.toHaveBeenCalled();noWrite();
 });
 it.each(["?authorId="+actors.B.id,"?isAdmin=true","?hideCompleted=true",
  "?scope=all","?x=1&x=2","?kind=video","?sort=course",
 ])("invalid query override %s -> 400 before Core",async q=>{
  const r=await send("A",q);expect(r.status).toBe(400);assertPrivate(r);
  expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
  expect(store.find).not.toHaveBeenCalled();noWrite();
 });
 it("no POST exam summary mutation",async()=>{
  const r=await send("A","","POST");
  expect([404,405]).toContain(r.status);
  assertPrivate(r);expect(store.find).not.toHaveBeenCalled();noWrite();
 });
 it("Prisma error -> masked500 not false empty",async()=>{
  store.find.mockRejectedValueOnce(Error(PRIVATE));
  const r=await send("A");expect(r.status).toBe(500);assertPrivate(r);
  const obj=await r.json();
  expect(obj).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
  expect(JSON.stringify(obj)).not.toContain(PRIVATE);noWrite();
 });
 it.each(["invalidStatus","badDate","missingCourse","missingStep"] as const)(
  "corrupt Core mapped data %s => masked500",async kind=>{
   const invalid=structuredClone(data[0]!);
   if(kind==="invalidStatus")
    (invalid.userStep as {status:string}).status="NOT_STARTED";
   if(kind==="badDate")invalid.createdAt=new Date("invalid");
   if(kind==="missingCourse")
    (invalid.userStep as {userTraining:{dayOnCourse:{course:unknown}}})
     .userTraining.dayOnCourse.course=null;
   if(kind==="missingStep")
    (invalid.userStep as {stepOnDay:{step:unknown}}).stepOnDay.step=null;
   store.find.mockImplementation(async(q:Query)=>
    "userStep" in q.where?[invalid]:[]);
   const r=await send("A");expect(r.status).toBe(500);assertPrivate(r);
   expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
   noWrite();
  });
});
