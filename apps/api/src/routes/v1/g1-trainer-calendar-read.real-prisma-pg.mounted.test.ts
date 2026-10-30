/** ACTUAL Hono signed JWT -> actual Core -> actual Prisma relations -> OWN PG14.
 * Runtime uses a SELECT-ONLY SQL role; fixtures use a separate admin client.
 * No Core/Prisma mocks, real HTTP server, external DB, data migration or writes.
 */
import {randomBytes} from "node:crypto";
import {PrismaClient, type StepType, type UserRole} from "../../../../../packages/prisma/node_modules/@prisma/client";
import {prisma} from "@gafus/prisma";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
const gate=vi.hoisted(()=>({hits:[] as string[]}));
vi.mock("@hono-rate-limiter/redis",()=>({
 RedisStore:class {
  windowMs=60000;
  init(v:{windowMs:number}){this.windowMs=v.windowMs;}
  async increment(key:string){gate.hits.push(key);
   return {totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};}
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
 },
}));
vi.mock("@gafus/core/services/auth",async orig=>({
 ...await orig<object>(),isRegistrationCompleted:async()=>true,
}));
// Intentionally no mock of @gafus/prisma or @gafus/core/services/dailyCourse.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {getDailyCourseCandidates,getDailyCourseScheduleRange}
 from "@gafus/core/services/dailyCourse";

const tag="ag1_calendar_real_"+randomBytes(4).toString("hex")+"_";
const makeId=(value:string)=>tag+value;
const actors={
 A:{id:makeId("owner_a"),username:makeId("a"),role:"TRAINER"},
 B:{id:makeId("owner_b"),username:makeId("b"),role:"TRAINER"},
 EMPTY:{id:makeId("owner_empty"),username:makeId("empty"),role:"TRAINER"},
 ADMIN:{id:makeId("admin"),username:makeId("adminname"),role:"ADMIN"},
 MOD:{id:makeId("moderator"),username:makeId("modname"),role:"MODERATOR"},
 USER:{id:makeId("ordinary"),username:makeId("ordinaryname"),role:"USER"},
} as const;
const tokens:Record<string,string>={};
const route="/api/v1/trainer/daily-course";
const range="?from=2031-04-20&to=2031-04-24";
const readonlyRole="ag1_cal132_read";
const url=process.env.G1_AG1_CALENDAR_ADMIN_URL??"";
const privileged=new PrismaClient({datasources:{db:{url}}});
const SECRET="PRIVATE-TRAINER-PAYMENT-MEDIA-STUDENT-SECRET";
type StepSpec={type:StepType;daily?:boolean;video?:boolean;written?:boolean;test?:boolean};
let idx=0;
async function addBundle(name:string,owner:string,updated:string,steps:StepSpec[]){
 const stepIds:string[]=[];
 for(const s of steps){
  idx++;
  const stepId=makeId("s"+idx);
  await privileged.step.create({data:{
   id:stepId,title:"SQL step "+idx,authorId:owner,description:SECRET,
   type:s.type,isDailyCourse:s.daily??true,
   requiresVideoReport:s.video??false,requiresWrittenFeedback:s.written??false,
   hasTestQuestions:s.test??false,
  }});
  stepIds.push(stepId);
 }
 await privileged.dailyCourseBundle.create({data:{
  id:makeId(name),title:"SQL "+name,type:"TRAINING",
  authorId:owner,equipment:SECRET,description:SECRET,
  updatedAt:new Date(updated),
  stepLinks:{create:stepIds.map((stepId,i)=>({
   id:makeId(name+"_link"+i),stepId,order:i+1,
  }))},
 }});
 return makeId(name);
}
async function addSchedule(name:string,date:string,bundleId:string,owner:string){
 await privileged.dailyCourseSchedule.create({data:{
  id:makeId(name),date:new Date(date+"T00:00:00.000Z"),
  bundleId,createdById:owner,isPublished:name!=="a_last",
 }});
}
const get=(who:string,path:string)=>app.request(route+path,{
 method:"GET",headers:who?{authorization:"Bearer "+(tokens[who]??who)}:{},
});
function privateReply(r:Response){
 expect((r.headers.get("cache-control")??"").toLowerCase()).toContain("private");
 expect((r.headers.get("cache-control")??"").toLowerCase()).toContain("no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
}
async function exact(r:Response,keys:string[]){
 expect(r.status).toBe(200);privateReply(r);
 const body=await r.json() as {success:boolean;data:Record<string,unknown>[]};
 expect(Object.keys(body).sort()).toEqual(["data","success"]);
 expect(body.success).toBe(true);
 for(const x of body.data)expect(Object.keys(x).sort()).toEqual(keys);
 expect(JSON.stringify(body)).not.toContain(SECRET);
 expect(JSON.stringify(body)).not.toContain("example.invalid");
 return body.data;
}
beforeAll(async()=>{
 const runtime=process.env.DATABASE_URL??"";
 if(process.env.G1_AG1_OWN_PG!=="1" ||
    !runtime.includes("ag1_cal132_read@") ||
    !runtime.includes("/ag1_calendar132?") ||
    !runtime.includes(".ag1-course-pg/sock") ||
    !url.includes("/ag1_calendar132?") ||
    !url.includes(".ag1-course-pg/sock"))
  throw Error("REFUSE_NON_OWN_ISOLATED_PG");
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 await privileged.$connect();
 const rights=await prisma.$queryRaw<{name:string;read:boolean;write:boolean}[]>`
  SELECT current_user::text AS name,
   has_table_privilege(current_user,'public."DailyCourseBundle"','SELECT') AS read,
   has_table_privilege(current_user,'public."DailyCourseBundle"','INSERT') AS write
 `;
 expect(rights).toEqual([{name:readonlyRole,read:true,write:false}]);
 for(const [label,a] of Object.entries(actors)){
  tokens[label]=await generateAccessToken(a);
  await privileged.user.create({data:{
   id:a.id,username:a.username,password:SECRET,
   email:a.username+"@example.invalid",role:a.role as UserRole,
  }});
 }
 const older=await addBundle("a_old",actors.A.id,"2031-04-18T12:00:00Z",[
  {type:"TRAINING"},{type:"PRACTICE"},
 ]);
 const bonly=await addBundle("b_mid",actors.B.id,"2031-04-20T12:00:00Z",[
  {type:"SURVEY"},{type:"BREAK"},
 ]);
 const examination=await addBundle("a_exam",actors.A.id,"2031-04-22T12:00:00Z",[
  {type:"THEORY"},{type:"EXAMINATION",video:true,written:true,test:true},
 ]);
 await addBundle("a_one",actors.A.id,"2031-04-23T12:00:00Z",[
  {type:"TRAINING"},
 ]);
 await addBundle("a_six",actors.A.id,"2031-04-24T12:00:00Z",
  Array.from({length:6},()=>({type:"TRAINING" as const})));
 await addBundle("a_flagged",actors.A.id,"2031-04-25T12:00:00Z",[
  {type:"THEORY",written:true},{type:"TRAINING"},
 ]);
 await addBundle("b_notdaily",actors.B.id,"2031-04-26T12:00:00Z",[
  {type:"TRAINING",daily:false},{type:"TRAINING"},
 ]);
 await addBundle("b_diary",actors.B.id,"2031-04-27T12:00:00Z",[
  {type:"DIARY"},{type:"PRACTICE"},
 ]);
 await addSchedule("b_first","2031-04-20",bonly,actors.B.id);
 await addSchedule("a_middle","2031-04-22",examination,actors.A.id);
 await addSchedule("a_last","2031-04-24",older,actors.A.id);
 await addSchedule("a_outside","2031-05-02",older,actors.A.id);
},90000);
afterAll(async()=>{await prisma.$disconnect();await privileged.$disconnect();});
describe("AG1 calendar joined ACTUAL Hono+Core+Prisma+own readonly PostgreSQL",()=>{
 it("real Core exports bound, not substituted by mocks",()=>{
  expect(typeof getDailyCourseCandidates).toBe("function");
  expect(typeof getDailyCourseScheduleRange).toBe("function");
 });
 it("TRAINER A->B->A SQL owner filter, nested steps eligibility, updatedAt DESC",async()=>{
  for(const [role,names] of [
   ["A",["a_exam","a_old"]],["B",["b_mid"]],["A",["a_exam","a_old"]],
  ] as const){
   const rows=await exact(await get(role,"/candidates"),
    ["authorId","authorUsername","id","stepsCount","title","type"]);
   expect(rows.map(x=>x.id)).toEqual(names.map(makeId));
   expect(rows.every(x=>x.authorId===actors[role].id)).toBe(true);
  }
 });
 it.each(["ADMIN","MOD"] as const)(
  "%s actual SQL mixed-owner candidates, invalid bundles excluded",async who=>{
   const rows=await exact(await get(who,"/candidates"),
    ["authorId","authorUsername","id","stepsCount","title","type"]);
   expect(rows.map(x=>x.id)).toEqual(["a_exam","b_mid","a_old"].map(makeId));
   expect(new Set(rows.map(x=>x.authorId)).size).toBe(2);
  });
 it("TRAINER A->B->A SQL inclusive schedule window, date ASC and nested whitelist",async()=>{
  for(const [who,names,dates] of [
   ["A",["a_middle","a_last"],["2031-04-22","2031-04-24"]],
   ["B",["b_first"],["2031-04-20"]],
   ["A",["a_middle","a_last"],["2031-04-22","2031-04-24"]],
  ] as const){
   const rows=await exact(await get(who,"/schedule-range"+range),
    ["bundle","createdBy","date","id","isPublished"]);
   expect(rows.map(x=>x.id)).toEqual(names.map(makeId));
   expect(rows.map(x=>x.date)).toEqual(dates);
   for(const r of rows){
    expect(Object.keys(r.bundle as object).sort()).toEqual(
     ["id","stepsCount","title","type"]);
    expect(Object.keys(r.createdBy as object).sort()).toEqual(["id","username"]);
    expect((r.bundle as {stepsCount:number}).stepsCount).toBe(2);
   }
   if(who==="A")expect(rows[1]?.isPublished).toBe(false);
  }
 });
 it.each(["ADMIN","MOD"] as const)(
  "%s actual SQL mixed-owner schedules and both inclusive bounds",async who=>{
   const rows=await exact(await get(who,"/schedule-range"+range),
    ["bundle","createdBy","date","id","isPublished"]);
   expect(rows.map(x=>x.id)).toEqual(
    ["b_first","a_middle","a_last"].map(makeId));
   expect(rows.map(x=>x.date)).toEqual(
    ["2031-04-20","2031-04-22","2031-04-24"]);
  });
 it("actual genuine empty SQL results are 200 []",async()=>{
  const nothing=await get("EMPTY","/candidates");
  expect(nothing.status).toBe(200);privateReply(nothing);
  expect(await nothing.json()).toEqual({success:true,data:[]});
  const emptyRange=await get("A","/schedule-range?from=2031-04-01&to=2031-04-02");
  expect(emptyRange.status).toBe(200);privateReply(emptyRange);
  expect(await emptyRange.json()).toEqual({success:true,data:[]});
 });
 it("real permission denied on Prisma SELECT is masked500, never false []",async()=>{
  await privileged.$executeRawUnsafe(
   'REVOKE SELECT ON "DailyCourseBundle" FROM "'+readonlyRole+'"');
  try {
   const result=await get("A","/candidates");
   expect(result.status).toBe(500);privateReply(result);
   const body=await result.json() as Record<string,unknown>;
   expect(body).toMatchObject({success:false,code:"INTERNAL_SERVER_ERROR"});
   expect(JSON.stringify(body)).not.toContain("permission denied");
  } finally {
   await privileged.$executeRawUnsafe(
    'GRANT SELECT ON "DailyCourseBundle" TO "'+readonlyRole+'"');
  }
  expect((await exact(await get("A","/candidates"),
   ["authorId","authorUsername","id","stepsCount","title","type"])).length).toBe(2);
 });
 it("runtime SQL role is SELECT-only; GETs did not mutate fixtures",async()=>{
  const noWrites=await prisma.$queryRaw<{insert:boolean;update:boolean;del:boolean}[]>`
   SELECT
    has_table_privilege(current_user,'public."DailyCourseSchedule"','INSERT') AS insert,
    has_table_privilege(current_user,'public."DailyCourseSchedule"','UPDATE') AS update,
    has_table_privilege(current_user,'public."DailyCourseSchedule"','DELETE') AS del
  `;
  expect(noWrites).toEqual([{insert:false,update:false,del:false}]);
  expect(await privileged.dailyCourseSchedule.count()).toBe(4);
  expect(await privileged.dailyCourseBundle.count()).toBe(8);
 });
});
