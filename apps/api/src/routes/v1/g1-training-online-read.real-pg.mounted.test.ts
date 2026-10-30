/** AG1 G1: registered online training GETs + real Prisma engine/OWN PG, read-only actor. */
import {randomBytes} from "node:crypto";
import {PrismaClient,type UserRole} from "../../../../../packages/prisma/node_modules/@prisma/client";
import {prisma} from "@gafus/prisma";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
 windowMs=60000;
 init(config:{windowMs:number}){this.windowMs=config.windowMs;}
 async increment(){return {totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};}
 async decrement(){return undefined;}
 async resetKey(){return undefined;}
}}));
// Workspace NextAuth adapter is not needed for signed bearer JWT; no auth behavior mocked.
vi.mock("@gafus/auth",()=>({InvalidPasswordResetTokenError:class extends Error{}}));
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:async()=>true,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
const random=randomBytes(5).toString("hex");
const tag="ag1trainonline_"+random+"_";
// Valid 25-character CUID, no external IDs or cross-fixture references.
const id=(name:string)=>"c"+random+name.padEnd(14,"0");
const actors={
 A:{id:id("actora"),username:tag+"actorA",role:"USER"},
 B:{id:id("actorb"),username:tag+"actorB",role:"USER"},
 AUTHOR:{id:id("author"),username:tag+"author",role:"TRAINER"},
} as const;
const tokens:Record<string,string>={};
const data={
 free:{course:id("freecourse"),type:tag+"free",day:id("freeday"),link:id("freelink"),
  step:id("freestep"),stepLink:id("freestlink")},
 paid:{course:id("paidcourse"),type:tag+"paid",day:id("paidday"),link:id("paidlink"),
  step:id("paidstep"),stepLink:id("paidstlink")},
 private:{course:id("privcourse"),type:tag+"private",day:id("privday"),link:id("privlink"),
  step:id("privstep"),stepLink:id("privstlink")},
 personalized:{course:id("perscourse"),type:tag+"personal",day:id("persday"),link:id("perslink"),
  step:id("persstep"),stepLink:id("persstlink")},
} as const;
const adminUrl=process.env.G1_AG1_TRAINING_ADMIN_URL??"";
const owner=new PrismaClient({datasources:{db:{url:adminUrl}}});
const PRIVATE="PRIVATE_STEP_SENTINEL_NO_PII_OR_MEDIA";
const create=(record:typeof data[keyof typeof data])=>record;
const pathDays=(type:string)=>"/api/v1/training/days?type="+encodeURIComponent(type);
const pathDay=(courseType:string,dayOnCourseId:string)=>
 "/api/v1/training/day?courseType="+encodeURIComponent(courseType)+
 "&dayOnCourseId="+dayOnCourseId+"&createIfMissing=false";
const request=(who:string,path:string)=>app.request(path,{
 method:"GET",headers:who?{Authorization:"Bearer "+tokens[who]}:{},
});
type TrainingReadResult={
 success:boolean;
 data?:{
  trainingDays:{dayOnCourseId:string}[];
  steps:{locked:boolean;description:string;videoUrl:string;imageUrls:string[];pdfUrls:string[]}[];
  description:string;
 };
 code?:string;
};
const read=(r:Response)=>r.json() as Promise<TrainingReadResult>;
let connected=false;
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1")throw Error("REFUSE_TRAINING_SQL_NOT_OPTED_IN");
 for(const [value,role] of [[process.env.DATABASE_URL??"","ag1_stats135_read"],
  [adminUrl,"ag1_course"]] as const){
  if(!value.includes("postgresql://"+role+"@")||
   !value.includes("/ag1_stats135?")||!value.includes(".ag1-course-pg/sock"))
    throw Error("REFUSE_EXTERNAL_TRAINING_DATABASE");
 }
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 process.env.ENABLE_COURSE_CACHE="false";
 await owner.$connect();connected=true;
 const permissions=await prisma.$queryRaw<{
  selects:boolean;updates:boolean;inserts:boolean;deletes:boolean
 }[]>`SELECT has_table_privilege(current_user,'public."UserTraining"','SELECT') AS selects,
 has_table_privilege(current_user,'public."UserTraining"','UPDATE') AS updates,
 has_table_privilege(current_user,'public."UserTraining"','INSERT') AS inserts,
 has_table_privilege(current_user,'public."UserTraining"','DELETE') AS deletes`;
 expect(permissions).toEqual([{selects:true,updates:false,inserts:false,deletes:false}]);
 // Existing flag must permit default ON; NEVER edit application flags.
 const flag=await prisma.appFeatureFlag.findUnique({
  where:{key:"app_subscription_gating"},select:{enabled:true}});
 if(flag?.enabled===false)throw Error("REFUSE_GATING_DISABLED_SQL_FIXTURE");
 // Test cohort owns no subscriptions; never create/update any subscription/payment row.
 for(const [name,actor] of Object.entries(actors)){
  tokens[name]=await generateAccessToken(actor);
  await owner.user.create({data:{id:actor.id,username:actor.username,
   role:actor.role as UserRole,password:"disabled-test-only",
   email:actor.username+"@example.invalid"}});
 }
 for(const [key,raw] of Object.entries(data)){
  const item=create(raw);
  await owner.course.create({data:{id:item.course,type:item.type,name:tag+key,
   authorId:actors.AUTHOR.id,trainingLevel:"BEGINNER",duration:"1 day",logoImg:"",
   description:key==="paid"?PRIVATE:"",isPaid:key==="paid",
   isPrivate:key==="private",isPersonalized:key==="personalized"}});
  await owner.trainingDay.create({data:{id:item.day,authorId:actors.AUTHOR.id,
   title:key+" day",description:key==="paid"?PRIVATE:"",type:"regular"}});
  await owner.dayOnCourse.create({data:{id:item.link,courseId:item.course,
   dayId:item.day,order:1}});
  await owner.step.create({data:{id:item.step,authorId:actors.AUTHOR.id,
   title:key+" step",description:key==="paid"?PRIVATE:"",type:"THEORY",
   videoUrl:null,imageUrls:[],pdfUrls:[]}});
  await owner.stepOnDay.create({data:{id:item.stepLink,dayId:item.day,
   stepId:item.step,order:0}});
 }
 await owner.courseAccess.create({data:{courseId:data.private.course,userId:actors.A.id}});
 await owner.userCourse.create({data:{courseId:data.personalized.course,
  userId:actors.A.id,userDisplayName:"Synthetic viewer"}});
},90000);
afterAll(async()=>{
 try{if(connected){
  // Exactly owned primary keys, no broad deletes, even after partial setup failure.
  await owner.userCourse.deleteMany({where:{courseId:data.personalized.course,userId:actors.A.id}});
  await owner.courseAccess.deleteMany({where:{courseId:data.private.course,userId:actors.A.id}});
  await owner.stepOnDay.deleteMany({where:{id:{in:Object.values(data).map(x=>x.stepLink)}}});
  await owner.dayOnCourse.deleteMany({where:{id:{in:Object.values(data).map(x=>x.link)}}});
  await owner.step.deleteMany({where:{id:{in:Object.values(data).map(x=>x.step)}}});
  await owner.trainingDay.deleteMany({where:{id:{in:Object.values(data).map(x=>x.day)}}});
  await owner.course.deleteMany({where:{id:{in:Object.values(data).map(x=>x.course)}}});
  await owner.user.deleteMany({where:{id:{in:Object.values(actors).map(x=>x.id)}}});
 }}finally{await prisma.$disconnect();await owner.$disconnect();}
},90000);
describe("Training online real JWT/Core/Prisma isolated PG read",()=>{
 it("free public days and day are visible for A/B with no GET writes",async()=>{
  for(const who of ["A","B"]){
   const days=await request(who,pathDays(data.free.type));
   expect(days.status).toBe(200);
   const listed=await read(days);
   expect(listed.data?.trainingDays.map((d:{dayOnCourseId:string})=>d.dayOnCourseId))
    .toEqual([data.free.link]);
   const day=await request(who,pathDay(data.free.type,data.free.link));
   expect(day.status).toBe(200);
   const detail=await read(day);
   expect(detail.data?.steps).toHaveLength(1);
   expect(detail.data?.steps[0].locked).toBe(false);
  }
 });
 it("paid no-entitlement days denied; day preview locks/redacts step",async()=>{
  for(const who of ["A","B"]){
   const days=await request(who,pathDays(data.paid.type));
   expect(days.status).toBe(403);
   const day=await request(who,pathDay(data.paid.type,data.paid.link));
   expect(day.status).toBe(200);
   const payload=await read(day);
   expect(payload.data?.steps[0].locked).toBe(true);
   expect(payload.data?.steps[0].description).toBe("");
   expect(payload.data?.steps[0].videoUrl).toBe("");
   expect(payload.data?.steps[0].imageUrls).toEqual([]);
   expect(payload.data?.steps[0].pdfUrls).toEqual([]);
   expect(payload.data?.description).toBe("");
   expect(JSON.stringify(payload)).not.toContain(PRIVATE);
  }
 });
 it("private requires real own assignment, A succeeds and B denied",async()=>{
  expect((await request("A",pathDays(data.private.type))).status).toBe(200);
  expect((await request("B",pathDays(data.private.type))).status).toBe(403);
  expect((await request("A",pathDay(data.private.type,data.private.link))).status).toBe(200);
  expect((await request("B",pathDay(data.private.type,data.private.link))).status).toBe(403);
 });
 it("personalized free day requests 428 without profile, A personalized reads",async()=>{
  const required=await request("B",pathDay(data.personalized.type,data.personalized.link));
  expect(required.status).toBe(428);
  expect((await read(required)).code).toBe("PERSONALIZATION_REQUIRED");
  const ready=await request("A",pathDay(data.personalized.type,data.personalized.link));
  expect(ready.status).toBe(200);
 });
 it("guest401, missing day404 and SQL read role cannot mutate progress",async()=>{
  expect((await request("",pathDays(data.free.type))).status).toBe(401);
  expect((await request("",pathDay(data.free.type,data.free.link))).status).toBe(401);
  expect((await request("A",pathDay(data.free.type,id("missing")))).status).toBe(404);
  const state=await prisma.$queryRaw<{ins:boolean;upd:boolean;del:boolean}[]>`
   SELECT has_table_privilege(current_user,'public."UserStep"','INSERT') AS ins,
   has_table_privilege(current_user,'public."UserStep"','UPDATE') AS upd,
   has_table_privilege(current_user,'public."UserStep"','DELETE') AS del`;
  expect(state).toEqual([{ins:false,upd:false,del:false}]);
  expect(await owner.userTraining.count({where:{userId:{in:[actors.A.id,actors.B.id]}}}))
   .toBe(0);
  expect(await owner.userStep.count({where:{userTraining:{userId:{in:[actors.A.id,actors.B.id]}}}}))
   .toBe(0);
 });
});
