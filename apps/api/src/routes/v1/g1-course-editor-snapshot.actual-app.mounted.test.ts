/** Registered signed-JWT Hono -> frozen AG4 editor snapshot parser.
 * Core mocked for transport only; independent actual Core/Prisma/PG 4 PASS.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type * as CoreModule from "@gafus/core/services/trainerCourse";
const m=vi.hoisted(()=>({
 snap:vi.fn(),session:vi.fn(),registration:vi.fn(),write:vi.fn(),
 limited:false,rate:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
 RedisStore:class {
  windowMs=60000;
  init(opts:{windowMs:number}){this.windowMs=opts.windowMs;}
  async increment(key:string){
   m.rate.push(key);
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
  course:{...actual.prisma.course,update:m.write,updateMany:m.write},
  $transaction:m.write,
 }};
});
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/trainerCourse",async original=>({
 ...await original<typeof CoreModule>(),getCourseEditorSnapshot:m.snap,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {parseVersionedCourseEditorSnapshot}
 from "../../../../../apps/trainer-panel/src/trainer-vite/trainerCourseDraftReadContract";

const SECRET="SECRET_PRIVATE_EMAIL_PAYMENT_TOKEN";
const actors={
 A:{id:"actor_A",username:"trainerA",role:"TRAINER"},
 B:{id:"actor_B",username:"trainerB",role:"TRAINER"},
 ADMIN:{id:"actor_admin",username:"admin",role:"ADMIN"},
 MOD:{id:"actor_mod",username:"moderator",role:"MODERATOR"},
 USER:{id:"actor_user",username:"user",role:"USER"},
} as const;
const jwt:Record<string,string>={};
const row=(owner="actor_A")=>({
 id:"course_A",version:7,name:"Frozen course",guideContent:null,
 shortDesc:"Short",description:"Description",duration:"12",
 videoUrl:null,logoImg:"",isPrivate:true,isPaid:false,
 showInProfile:true,isPersonalized:false,equipment:"",
 trainingLevel:"BEGINNER",
 dayLinks:[{id:"link_1",dayId:"day_1",order:1,
  day:{id:"day_1",title:"Day",secretNotes:SECRET},
  privateProgress:SECRET}],
 access:[{userId:"user_1",user:{
  id:"user_1",username:"student",email:SECRET},billing:SECRET}],
 authorId:owner,privatePayments:SECRET,reviewEmails:SECRET,
});
const req=(who:string,path="course_A/editor-snapshot")=>
 app.request("/api/v1/trainer/courses/"+path,{
  method:"GET",
  headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
 });
const privateResponse=(res:Response)=>{
 const cache=(res.headers.get("cache-control")??"").toLowerCase()
  .split(",").map(x=>x.trim());
 expect(cache).toContain("private");
 expect(cache).toContain("no-store");
 expect(cache).not.toContain("public");
 expect(res.headers.get("referrer-policy")).toBe("no-referrer");
};
beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 for(const [name,actor] of Object.entries(actors))
  jwt[name]=await generateAccessToken(actor);
});
beforeEach(()=>{
 vi.clearAllMocks();m.limited=false;m.rate.length=0;
 m.registration.mockResolvedValue(true);
 m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
 m.snap.mockImplementation(async(id:string,actor:{id:string;role:string})=>{
  if(id==="missing"||actor.role==="TRAINER"&&actor.id!=="actor_A")
   return {status:"not_found"};
  return {status:"found",data:row()};
 });
});
const noWrites=()=>expect(m.write).not.toHaveBeenCalled();
describe("AG1 TR012 signed registered atomic editor snapshot",()=>{
 it.each(["A","ADMIN"] as const)(
  "%s receives AG4 strict snapshot and original owner identity",async who=>{
   const res=await req(who);
   expect(res.status).toBe(200);privateResponse(res);
   const body=await res.json();
   expect(Object.keys(body).sort()).toEqual(["data","success"]);
   expect(body.success).toBe(true);
   const dto=parseVersionedCourseEditorSnapshot(body,"course_A");
   expect(dto.version).toBe(7);
   expect(dto.dayLinks.map(x=>x.dayId)).toEqual(["day_1"]);
   expect(dto.access.map(x=>x.userId)).toEqual(["user_1"]);
   expect(Object.keys(dto)).toHaveLength(17);
   expect(JSON.stringify(body)).not.toContain(SECRET);
   expect(m.snap).toHaveBeenCalledExactlyOnceWith("course_A",{
    id:actors[who].id,role:actors[who].role,
   });
   noWrites();
  });
 it("foreign TRAINER and missing course are masked404 before exposure",async()=>{
  for(const [who,path] of [["B","course_A/editor-snapshot"],
   ["A","missing/editor-snapshot"]] as const){
   const r=await req(who,path);
   expect(r.status).toBe(404);privateResponse(r);
   expect(await r.json()).toEqual({
    success:false,code:"NOT_FOUND",error:"Курс не найден",
   });
  }
  noWrites();
 });
 it.each(["MOD","USER"] as const)("%s gets 403 pre-Core",async who=>{
  const r=await req(who);
  expect(r.status).toBe(403);privateResponse(r);
  expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
  expect(m.snap).not.toHaveBeenCalled();noWrites();
 });
 it.each(["","invalid.jwt"])("guest/bad JWT 401 before Core/limiter %s",async who=>{
  const r=await req(who);
  expect(r.status).toBe(401);privateResponse(r);
  expect(await r.json()).toMatchObject({code:"UNAUTHORIZED"});
  expect(m.rate).toHaveLength(0);
  expect(m.snap).not.toHaveBeenCalled();noWrites();
 });
 it("registration pending remains distinct 401 before Core",async()=>{
  m.registration.mockResolvedValueOnce(false);
  const r=await req("A");expect(r.status).toBe(401);privateResponse(r);
  expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
  expect(m.snap).not.toHaveBeenCalled();noWrites();
 });
 it("rate limiter 429 before Core",async()=>{
  m.limited=true;
  const r=await req("A");expect(r.status).toBe(429);privateResponse(r);
  expect(await r.json()).toMatchObject({code:"RATE_LIMITED"});
  expect(m.snap).not.toHaveBeenCalled();noWrites();
 });
 it.each(["course_A/editor-snapshot?authorId=actor_B",
  "course_A/editor-snapshot?allowAdmin=true",
  "course_A/editor-snapshot?version=1",
  "bad%2Fid/editor-snapshot",
 ])("invalid query or path %s -> 400 pre-Core",async path=>{
  const r=await req("A",path);
  expect(r.status).toBe(400);privateResponse(r);
  expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
  expect(m.snap).not.toHaveBeenCalled();noWrites();
 });
 it("Core storage fault is masked500, not false 404",async()=>{
  m.snap.mockRejectedValueOnce(Error(SECRET));
  const r=await req("A");
  expect(r.status).toBe(500);privateResponse(r);
  const result=await r.json();
  expect(result).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
  expect(JSON.stringify(result)).not.toContain(SECRET);
  noWrites();
 });
 it.each(["missingVersion","wrongDay","badAccess","badVersion"] as const)(
  "malformed Core snapshot %s safely fails closed 500",async kind=>{
   const bad=row() as Record<string,unknown>;
   if(kind==="missingVersion")delete bad.version;
   if(kind==="badVersion")bad.version=0;
   if(kind==="wrongDay")bad.dayLinks=[{id:"link_1",dayId:"day_1",
    order:1,day:{id:"foreign_day",title:"Bad"}}];
   if(kind==="badAccess")bad.access=[{userId:"user_1",
    user:{id:"foreign",username:"bad"}}];
   m.snap.mockResolvedValueOnce({status:"found",data:bad});
   const r=await req("A");
   // References are validated by AG4 parser; the route should enforce
   // the same relational invariants, not defer them solely to browser.
   expect(r.status).toBe(500);privateResponse(r);
   expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
   noWrites();
  });
});
