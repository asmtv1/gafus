/**
 * AG1 G1 TR018 registered Trainer course statistics READ:
 * real JWT/Hono, unmocked Core statistics, real Prisma-engine PostgreSQL.
 * Only Redis rate backend and registration-completion external guard mocked.
 * App connects through an SQL role without INSERT/UPDATE/DELETE privileges.
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
  init(config:{windowMs:number}){this.windowMs=config.windowMs;}
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
// Intentionally no Core statistics, Prisma or JWT mocks.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {getCourseStatistics} from "@gafus/core/services/statistics";

const tag="ag1_stats135_"+randomBytes(4).toString("hex")+"_";
const id=(name:string)=>tag+name;
const actors={
 A:{id:id("trainer_a"),username:id("trainer_a_name"),role:"TRAINER"},
 B:{id:id("trainer_b"),username:id("trainer_b_name"),role:"TRAINER"},
 EMPTY:{id:id("trainer_empty"),username:id("trainer_empty_name"),role:"TRAINER"},
 ADMIN:{id:id("admin"),username:id("admin_name"),role:"ADMIN"},
 MOD:{id:id("mod"),username:id("mod_name"),role:"MODERATOR"},
 USER:{id:id("user"),username:id("user_name"),role:"USER"},
 PARTNER:{id:id("partner"),username:id("partner_name"),role:"PARTNER"},
 STUDENT1:{id:id("student_1"),username:id("student_1_name"),role:"USER"},
 STUDENT2:{id:id("student_2"),username:id("student_2_name"),role:"USER"},
 STUDENT3:{id:id("student_3"),username:id("student_3_name"),role:"USER"},
} as const;
const tokens:Record<string,string>={};
const ROLE="ag1_stats135_read";
const ADMIN_URL=process.env.G1_AG1_STATS_ADMIN_URL??"";
const admin=new PrismaClient({datasources:{db:{url:ADMIN_URL}}});
const PATH="/api/v1/trainer/statistics/courses";
const SECRET="AG1_PERSONAL_STUDENT_EMAIL_REVIEW_COMMENT_PRIVATE";
const courseIds={
 A1:id("course_a_first"),A2:id("course_a_second"),B1:id("course_b_first"),
};
const send=(who:string,query="")=>app.request(PATH+query,{
 method:"GET",headers:who?{authorization:"Bearer "+(tokens[who]??who)}:{},
});
function privacy(response:Response){
 const cache=(response.headers.get("cache-control")??"").toLowerCase();
 expect(cache).toContain("private");
 expect(cache).toContain("no-store");
 expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
type Row={
 id:string;name:string;logoImg:string;avgRating:number|null;
 isPrivate:boolean;isPaid:boolean;isPersonalized:boolean;
 trainingLevel:string;totalUsers:number;completedUsers:number;
 inProgressUsers:number;notStartedUsers:number;
 author?:{username:string;fullName:string|null};
};
const rowKeys=[
 "author","avgRating","completedUsers","id","inProgressUsers","isPaid",
 "isPersonalized","isPrivate","logoImg","name","notStartedUsers",
 "totalUsers","trainingLevel",
];
async function success(who:string,query=""){
 const res=await send(who,query);
 expect(res.status).toBe(200);privacy(res);
 const body=await res.json() as {success:boolean;data:{
  courses:Row[];totalCourses:number;totalDays:number;
 }};
 expect(Object.keys(body).sort()).toEqual(["data","success"]);
 expect(Object.keys(body.data).sort()).toEqual([
  "courses","totalCourses","totalDays",
 ]);
 expect(body.success).toBe(true);
 expect(body.data.courses.length).toBe(body.data.totalCourses);
 for(const row of body.data.courses){
  expect(Object.keys(row).sort()).toEqual(rowKeys);
  expect(Object.keys(row.author??{}).sort()).toEqual(["fullName","username"]);
  expect(row.completedUsers+row.inProgressUsers+row.notStartedUsers)
   .toBeLessThanOrEqual(row.totalUsers);
 }
 expect(JSON.stringify(body)).not.toContain(SECRET);
 for(const student of ["STUDENT1","STUDENT2","STUDENT3"] as const)
  expect(JSON.stringify(body)).not.toContain(actors[student].username);
 expect(JSON.stringify(body)).not.toContain("@example.invalid");
 return body.data;
}
async function readonlySQL(){
 const result=await prisma.$queryRaw<{
  role:string;sel:boolean;insert:boolean;update:boolean;del:boolean;
 }[]>`
  SELECT current_user::text AS role,
   has_table_privilege(current_user,'public."Course"','SELECT') AS sel,
   has_table_privilege(current_user,'public."Course"','INSERT') AS insert,
   has_table_privilege(current_user,'public."Course"','UPDATE') AS update,
   has_table_privilege(current_user,'public."Course"','DELETE') AS del
 `;
 expect(result).toEqual([{
  role:ROLE,sel:true,insert:false,update:false,del:false,
 }]);
}
beforeAll(async()=>{
 const connection=process.env.DATABASE_URL??"";
 if(process.env.G1_AG1_OWN_PG!=="1" ||
   !connection.includes(ROLE+"@") ||
   !connection.includes("/ag1_stats135?") ||
   !connection.includes(".ag1-course-pg/sock") ||
   !ADMIN_URL.includes("ag1_course@") ||
   !ADMIN_URL.includes("/ag1_stats135?") ||
   !ADMIN_URL.includes(".ag1-course-pg/sock"))
  throw Error("REFUSE_NONOWNED_STATS_DATABASE");
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 await admin.$connect();
 await readonlySQL();
 for(const [key,actor] of Object.entries(actors)){
  tokens[key]=await generateAccessToken(actor);
  await admin.user.create({data:{
   id:actor.id,username:actor.username,role:actor.role as UserRole,
   password:SECRET,email:actor.username+"@example.invalid",
  }});
 }
 for(const [name,owner,created] of [
  ["A1",actors.A.id,"2031-01-03T00:00:00Z"],
  ["A2",actors.A.id,"2031-01-06T00:00:00Z"],
  ["B1",actors.B.id,"2031-01-04T00:00:00Z"],
 ] as const){
  await admin.course.create({data:{
   id:courseIds[name],name:"SQL "+name,
   type:id("unique_"+name).slice(0,48),
   trainingLevel:"BEGINNER",duration:"7 days",
   logoImg:"",authorId:owner,description:SECRET,
   isPaid:name==="B1",isPrivate:name==="A2",
   createdAt:new Date(created),
  }});
 }
 for(const [name,owner] of [
  ["a_day_1",actors.A.id],["a_day_2",actors.A.id],
  ["b_day_1",actors.B.id],
 ] as const){
  await admin.trainingDay.create({data:{
   id:id(name),title:name,description:SECRET,authorId:owner,
  }});
 }
 for(const [name,courseId,dayName,order] of [
  ["a_link_1",courseIds.A1,"a_day_1",1],
  ["a_link_2",courseIds.A1,"a_day_2",2],
  ["b_link_1",courseIds.B1,"b_day_1",1],
 ] as const){
  await admin.dayOnCourse.create({data:{
   id:id(name),courseId,dayId:id(dayName),order,
  }});
 }
 await admin.step.create({data:{
  id:id("linked_step"),title:"real linked step",
  type:"TRAINING",description:SECRET,authorId:actors.A.id,
 }});
 await admin.stepOnDay.create({data:{
  id:id("step_link"),dayId:id("a_day_1"),
  stepId:id("linked_step"),order:1,
 }});
 for(const [student,status] of [
  ["STUDENT1","COMPLETED"],["STUDENT2","IN_PROGRESS"],
  ["STUDENT3","NOT_STARTED"],
 ] as const){
  await admin.userCourse.create({data:{
   userId:actors[student].id,courseId:courseIds.A1,
   status,startedAt:status==="NOT_STARTED"?null:new Date("2031-01-08T00:00:00Z"),
   completedAt:status==="COMPLETED"?new Date("2031-01-09T00:00:00Z"):null,
   userDisplayName:SECRET,
  }});
 }
 await admin.courseReview.create({data:{
  id:id("review_private"),courseId:courseIds.A1,
  userId:actors.STUDENT1.id,rating:4,comment:SECRET,
 }});
},90000);
afterAll(async()=>{await prisma.$disconnect();await admin.$disconnect();});

describe("TR018 G1 signed Hono → actual Core/Prisma → own fullschema SQL",()=>{
 it("unmocked actual Core, TRAINER A→B→A SQL own counts, no participant PII",async()=>{
  expect(typeof getCourseStatistics).toBe("function");
  for(const [who,ids,days] of [
   ["A",[courseIds.A2,courseIds.A1],2],
   ["B",[courseIds.B1],1],
   ["A",[courseIds.A2,courseIds.A1],2],
  ] as const){
   const data=await success(who);
   expect(data.courses.map(x=>x.id)).toEqual(ids);
   expect(data.totalDays).toBe(days);
   expect(data.courses.map(x=>x.totalUsers)).toEqual(
    who==="B"?[0]:[0,2],
   );
   if(who==="A"){
    const a=data.courses[1]!;
    expect({
     completed:a.completedUsers,progress:a.inProgressUsers,
     notStarted:a.notStartedUsers,
    }).toEqual({completed:1,progress:1,notStarted:0});
   }
  }
 });
 it("ADMIN explicit all SQL full scope and explicit valid trainer only",async()=>{
  const all=await success("ADMIN","?scope=all");
  expect(all.courses.map(x=>x.id))
   .toEqual([courseIds.A2,courseIds.B1,courseIds.A1]);
  expect(all.totalDays).toBe(3);
  expect(all.totalCourses).toBe(3);
  const b=await success("ADMIN","?scope=trainer&trainerUserId="+actors.B.id);
  expect(b.courses.map(x=>x.id)).toEqual([courseIds.B1]);
  expect(b.totalDays).toBe(1);
  const a=await success("ADMIN","?scope=trainer&trainerUserId="+actors.A.id);
  expect(a.courses.map(x=>x.id)).toEqual([courseIds.A2,courseIds.A1]);
  expect(a.totalDays).toBe(2);
 });
 it("TRAINER no courses returns actual success zero not fabricated error",async()=>{
  const empty=await success("EMPTY");
  expect(empty).toEqual({courses:[],totalCourses:0,totalDays:0});
 });
 it("MOD,USER,PARTNER 403 and guest 401; no bypass via userId",async()=>{
  for(const who of ["MOD","USER","PARTNER"]){
   const result=await send(who);
   expect(result.status).toBe(403);privacy(result);
   expect(await result.json()).toMatchObject({code:"FORBIDDEN"});
  }
  const guest=await send("");
  expect(guest.status).toBe(401);privacy(guest);
  const cross=await send("A","?scope=all");
  expect(cross.status).toBe(403);privacy(cross);
 });
 it("ADMIN invalid target 400 before query, missing/nontrainer 404",async()=>{
  const malformed=await send("ADMIN","?scope=trainer&trainerUserId=%20");
  expect(malformed.status).toBe(400);privacy(malformed);
  expect(await malformed.json()).toMatchObject({code:"BAD_QUERY"});
  const unknown=await send("ADMIN","?scope=trainer&trainerUserId=validUnknown999");
  expect(unknown.status).toBe(404);privacy(unknown);
  expect(await unknown.json()).toMatchObject({code:"NOT_FOUND"});
  const notTrainer=await send("ADMIN","?scope=trainer&trainerUserId="+actors.USER.id);
  expect(notTrainer.status).toBe(404);privacy(notTrainer);
  const missingScope=await send("ADMIN");
  expect(missingScope.status).toBe(400);privacy(missingScope);
 });
 it("REAL SQL SELECT rejection masks 500, not empty200; restore and retry",async()=>{
  await admin.$executeRawUnsafe('REVOKE SELECT ON "Course" FROM "'+ROLE+'"');
  try{
   const r=await send("A");
   expect(r.status).toBe(500);privacy(r);
   const body=await r.json() as Record<string,unknown>;
   expect(body).toMatchObject({success:false,code:"INTERNAL_SERVER_ERROR"});
   expect(JSON.stringify(body)).not.toContain("permission denied");
   expect(JSON.stringify(body)).not.toContain(SECRET);
  }finally{
   await admin.$executeRawUnsafe('GRANT SELECT ON "Course" TO "'+ROLE+'"');
  }
  expect((await success("A")).totalCourses).toBe(2);
 });
 it("SQL READ-only runtime privileges and fixture rows unchanged",async()=>{
  await readonlySQL();
  expect(await admin.course.count()).toBe(3);
  expect(await admin.dayOnCourse.count()).toBe(3);
  expect(await admin.userCourse.count()).toBe(3);
  expect(await admin.courseReview.count()).toBe(1);
  expect(await admin.userTraining.count()).toBe(0);
 });
});
