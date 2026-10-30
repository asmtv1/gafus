/**
 * AG1 cont136: Existing trainer statistics STEPS read.
 * ACTUAL registered Hono -> signed JWT -> actual Core getStepStatistics
 * -> actual Prisma client / FK relation SQL in own full-schema PG14.
 * Runtime SQL role has SELECT only. Redis limiter storage and registration
 * completion are synthetic; no Prisma/Core read mocking or route writes.
 */
import {randomBytes} from "node:crypto";
import {PrismaClient,type UserRole} from
 "../../../../../packages/prisma/node_modules/@prisma/client";
import {prisma} from "@gafus/prisma";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
const rate=vi.hoisted(()=>({keys:[] as string[]}));
vi.mock("@hono-rate-limiter/redis",()=>({
 RedisStore:class {
  windowMs=60000;
  init(options:{windowMs:number}){this.windowMs=options.windowMs;}
  async increment(key:string){
   rate.keys.push(key);
   return {totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};
  }
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
 },
}));
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:async()=>true,
}));
// NO Core statistics/Prisma/client/JWT mock.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {getStepStatistics} from "@gafus/core/services/statistics";

const prefix="ag1_steps136_"+randomBytes(4).toString("hex")+"_";
const id=(name:string)=>prefix+name;
const actors={
 A:{id:id("trainer_a"),username:id("author_a"),role:"TRAINER"},
 B:{id:id("trainer_b"),username:id("author_b"),role:"TRAINER"},
 EMPTY:{id:id("trainer_empty"),username:id("author_empty"),role:"TRAINER"},
 ADMIN:{id:id("admin"),username:id("admin_name"),role:"ADMIN"},
 MOD:{id:id("mod"),username:id("moderator_name"),role:"MODERATOR"},
 USER:{id:id("user"),username:id("user_name"),role:"USER"},
 PARTNER:{id:id("partner"),username:id("partner_name"),role:"PARTNER"},
 STUDENT:{id:id("student"),username:id("student_user_private"),role:"USER"},
} as const;
const jwt:Record<string,string>={};
const TEST_PATH="/api/v1/trainer/statistics/steps";
const SECRET="AG1_PRIVATE_STUDENT_DIARY_EMAIL_MEDIA";
const readRole="ag1_stats136_read";
const ownerUrl=process.env.G1_AG1_STATS_STEPS_ADMIN_URL??"";
const privileged=new PrismaClient({datasources:{db:{url:ownerUrl}}});
const sid={
 A_SHARED:id("a_shared"),A_FREE:id("a_free"),A_ORPHAN:id("a_orphan"),
 B_SHARED:id("b_shared"),
};
const did={D1:id("day_one"),D2:id("day_two"),D3:id("day_three"),D4:id("day_four")};
const cid={A:id("course_a"),B:id("course_b")};
const linkIds={S1D1:id("s1d1"),S1D2:id("s1d2"),S2D3:id("s2d3"),
 S3D1:id("s3d1"),S3D4:id("s3d4")};

const send=(who:string,query="")=>app.request(TEST_PATH+query,{
 method:"GET",headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
});
function privacy(r:Response){
 const cache=(r.headers.get("cache-control")??"").toLowerCase();
 expect(cache).toContain("private");
 expect(cache).toContain("no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
}
type StepDTO={
 id:string;title:string;durationSec:number|null;
 usedInDaysCount:number;usedInCoursesCount:number;
};
const stepFields=[
 "durationSec","id","title","usedInCoursesCount","usedInDaysCount",
];
async function readSuccess(who:string,query=""){
 const response=await send(who,query);
 expect(response.status).toBe(200);privacy(response);
 const json=await response.json() as {
  success:boolean;data:{
   steps:StepDTO[];totalSteps:number;progressMetrics:string;
  };
 };
 expect(Object.keys(json).sort()).toEqual(["data","success"]);
 expect(Object.keys(json.data).sort())
  .toEqual(["progressMetrics","steps","totalSteps"]);
 expect(json.success).toBe(true);
 expect(json.data.progressMetrics).toBe("NOT_COMPUTED");
 expect(json.data.steps.length).toBe(json.data.totalSteps);
 for(const item of json.data.steps){
  expect(Object.keys(item).sort()).toEqual(stepFields);
  expect(item.usedInCoursesCount).toBeGreaterThanOrEqual(0);
  expect(item.usedInDaysCount).toBeGreaterThanOrEqual(0);
 }
 const rendered=JSON.stringify(json);
 expect(rendered).not.toContain(SECRET);
 expect(rendered).not.toContain("@example.invalid");
 expect(rendered).not.toContain(actors.STUDENT.username);
 expect(rendered).not.toContain("student_user_private");
 return json.data;
}
async function assertReadOnly(){
 const grants=await prisma.$queryRaw<{
  sqlRole:string;select:boolean;insert:boolean;update:boolean;del:boolean;
 }[]>`
  SELECT current_user::text AS "sqlRole",
   has_table_privilege(current_user,'public."Step"','SELECT') AS "select",
   has_table_privilege(current_user,'public."Step"','INSERT') AS "insert",
   has_table_privilege(current_user,'public."Step"','UPDATE') AS "update",
   has_table_privilege(current_user,'public."Step"','DELETE') AS "del"
 `;
 expect(grants).toEqual([{
  sqlRole:readRole,select:true,insert:false,update:false,del:false,
 }]);
}
async function addStep(stepId:string,authorId:string,createdAt:string,durationSec:number|null){
 await privileged.step.create({data:{
  id:stepId,authorId,
  title:"AG1 SQL "+stepId.slice(-11),description:SECRET,
  type:"TRAINING",durationSec,createdAt:new Date(createdAt),
 }});
}
beforeAll(async()=>{
 const runtimeUrl=process.env.DATABASE_URL??"";
 if(process.env.G1_AG1_OWN_PG!=="1" ||
   !runtimeUrl.includes(readRole+"@") ||
   !runtimeUrl.includes("/ag1_stats136?") ||
   !runtimeUrl.includes(".ag1-course-pg/sock") ||
   !ownerUrl.includes("ag1_course@") ||
   !ownerUrl.includes("/ag1_stats136?") ||
   !ownerUrl.includes(".ag1-course-pg/sock"))
  throw Error("AG1_G1_ABORT_NON_OWNED_DB_OR_WRITABLE_RUNTIME");
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 await privileged.$connect();
 await assertReadOnly();
 for(const [key,actor] of Object.entries(actors)){
  jwt[key]=await generateAccessToken(actor);
  await privileged.user.create({data:{
   id:actor.id,username:actor.username,role:actor.role as UserRole,
   password:SECRET,email:actor.username+"@example.invalid",
  }});
 }
 await addStep(sid.A_SHARED,actors.A.id,"2031-02-08T00:00:00Z",125);
 await addStep(sid.A_FREE,actors.A.id,"2031-02-05T00:00:00Z",null);
 await addStep(sid.A_ORPHAN,actors.A.id,"2031-02-01T00:00:00Z",45);
 await addStep(sid.B_SHARED,actors.B.id,"2031-02-07T00:00:00Z",90);
 for(const [day,owner] of [
  [did.D1,actors.A.id],[did.D2,actors.A.id],
  [did.D3,actors.A.id],[did.D4,actors.B.id],
 ] as const){
  await privileged.trainingDay.create({data:{
   id:day,title:"SQL training day "+day,authorId:owner,
   description:SECRET,
  }});
 }
 for(const [courseId,owner,type] of [
  [cid.A,actors.A.id,"AG1_STATS136_A"],
  [cid.B,actors.B.id,"AG1_STATS136_B"],
 ] as const){
  await privileged.course.create({data:{
   id:courseId,name:"AG1 training "+courseId,
   type:type+prefix.slice(-8),
   authorId:owner,trainingLevel:"BEGINNER",duration:"4 days",
   logoImg:"",description:SECRET,
  }});
 }
 for(const [linkId,courseId,dayId,order] of [
  [id("ca_d1"),cid.A,did.D1,1],
  [id("ca_d2"),cid.A,did.D2,2],
  [id("cb_d1"),cid.B,did.D1,1],
  [id("cb_d4"),cid.B,did.D4,2],
 ] as const){
  await privileged.dayOnCourse.create({data:{
   id:linkId,courseId,dayId,order,
  }});
 }
 for(const [linkId,stepId,dayId,order] of [
  [linkIds.S1D1,sid.A_SHARED,did.D1,1],
  [linkIds.S1D2,sid.A_SHARED,did.D2,1],
  [linkIds.S2D3,sid.A_FREE,did.D3,1],
  [linkIds.S3D1,sid.B_SHARED,did.D1,2],
  [linkIds.S3D4,sid.B_SHARED,did.D4,1],
 ] as const){
  await privileged.stepOnDay.create({data:{
   id:linkId,stepId,dayId,order,
  }});
 }
 // Real training progress exists, but existing LIST endpoint does not
 // compute participant metrics and MUST still report NOT_COMPUTED.
 await privileged.userTraining.create({data:{
  id:id("participant_training"),userId:actors.STUDENT.id,
  dayOnCourseId:id("ca_d1"),status:"COMPLETED",
  steps:{create:{
   id:id("participant_step"),stepOnDayId:linkIds.S1D1,
   status:"COMPLETED",
  }},
 }});
},90000);
afterAll(async()=>{await prisma.$disconnect();await privileged.$disconnect();});

describe("AG1 G1 Steps stats ACTUAL registered Hono/Core/Prisma own PG",()=>{
 it("actual Core owns SQL relation cardinalities, TRAINER A→B→A",async()=>{
  expect(typeof getStepStatistics).toBe("function");
  for(const [who,want] of [
   ["A",[sid.A_SHARED,sid.A_FREE,sid.A_ORPHAN]],
   ["B",[sid.B_SHARED]],
   ["A",[sid.A_SHARED,sid.A_FREE,sid.A_ORPHAN]],
  ] as const){
   const data=await readSuccess(who);
   expect(data.steps.map(step=>step.id)).toEqual(want);
   if(who==="A"){
    expect(data.steps.map(step=>[
     step.usedInDaysCount,step.usedInCoursesCount,step.durationSec,
    ])).toEqual([[2,2,125],[1,0,null],[0,0,45]]);
   }else{
    expect(data.steps.map(step=>[
     step.usedInDaysCount,step.usedInCoursesCount,
    ])).toEqual([[2,2]]);
   }
  }
 });
 it("ADMIN explicit all sees all four SQL Steps in createdAt DESC",async()=>{
  const data=await readSuccess("ADMIN","?scope=all");
  expect(data.steps.map(step=>step.id)).toEqual([
   sid.A_SHARED,sid.B_SHARED,sid.A_FREE,sid.A_ORPHAN,
  ]);
  expect(data.steps.find(step=>step.id===sid.A_SHARED))
   .toMatchObject({usedInDaysCount:2,usedInCoursesCount:2});
 });
 it("ADMIN explicit existing trainer A/B resolves role from SQL and filters",async()=>{
  const a=await readSuccess("ADMIN","?scope=trainer&trainerUserId="+actors.A.id);
  expect(a.steps.map(step=>step.id)).toEqual([
   sid.A_SHARED,sid.A_FREE,sid.A_ORPHAN,
  ]);
  const b=await readSuccess("ADMIN","?scope=trainer&trainerUserId="+actors.B.id);
  expect(b.steps.map(step=>step.id)).toEqual([sid.B_SHARED]);
 });
 it("real empty trainer gives success 0 with progressMetrics NOT_COMPUTED",async()=>{
  const zero=await readSuccess("EMPTY");
  expect(zero).toEqual({
   steps:[],totalSteps:0,progressMetrics:"NOT_COMPUTED",
  });
 });
 it("MODERATOR/USER/PARTNER forbidden, guest unauth, trainer cannot elevate",async()=>{
  for(const who of ["MOD","USER","PARTNER"]){
   const r=await send(who);
   expect(r.status).toBe(403);privacy(r);
   expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
  }
  const guest=await send("");
  expect(guest.status).toBe(401);privacy(guest);
  const illegal=await send("A","?scope=all");
  expect(illegal.status).toBe(403);privacy(illegal);
 });
 it("ADMIN bad/missing/other-role trainer scope fails closed",async()=>{
  const bad=await send("ADMIN","?scope=trainer&trainerUserId=%20");
  expect(bad.status).toBe(400);privacy(bad);
  const missing=await send("ADMIN");
  expect(missing.status).toBe(400);privacy(missing);
  const nonexistent=await send("ADMIN","?scope=trainer&trainerUserId=nonexistent135");
  expect(nonexistent.status).toBe(404);privacy(nonexistent);
  const nontrainer=await send("ADMIN","?scope=trainer&trainerUserId="+actors.USER.id);
  expect(nontrainer.status).toBe(404);privacy(nontrainer);
 });
 it("real PG permission-denied SELECT is masked 500, never false empty",async()=>{
  await privileged.$executeRawUnsafe(
   'REVOKE SELECT ON "Step" FROM "'+readRole+'"');
  try{
   const r=await send("A");
   expect(r.status).toBe(500);privacy(r);
   const data=await r.json() as Record<string,unknown>;
   expect(data).toMatchObject({success:false,code:"INTERNAL_SERVER_ERROR"});
   expect(JSON.stringify(data)).not.toContain("permission denied");
   expect(JSON.stringify(data)).not.toContain(SECRET);
  }finally{
   await privileged.$executeRawUnsafe(
    'GRANT SELECT ON "Step" TO "'+readRole+'"');
  }
  expect((await readSuccess("A")).totalSteps).toBe(3);
 });
 it("GET principal stays SELECT-only and FK fixtures unchanged",async()=>{
  await assertReadOnly();
  expect(await privileged.step.count()).toBe(4);
  expect(await privileged.stepOnDay.count()).toBe(5);
  expect(await privileged.dayOnCourse.count()).toBe(4);
  expect(await privileged.userTraining.count()).toBe(1);
  expect(await privileged.userStep.count()).toBe(1);
 });
});
