/**
 * Actual registered Hono + real signed JWT + actual Core snapshot +
 * actual Prisma Client + OWN isolated PostgreSQL 14.19.
 * Only Redis limiter and registration completeness are synthetic.
 * No network port, CDN, public DB, migration or user writes.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({registered:vi.fn(),rateKeys:[] as string[],rateLimited:false}));
vi.mock("@hono-rate-limiter/redis",()=>({
 RedisStore:class {
  windowMs=60000;
  init(arg:{windowMs:number}){this.windowMs=arg.windowMs;}
  async increment(key:string){
   m.rateKeys.push(key);
   return {totalHits:m.rateLimited?101:1,
    resetTime:new Date(Date.now()+this.windowMs)};
  }
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
 },
}));
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:m.registered,
}));
import {app} from "../../app";
import {prisma} from "@gafus/prisma";
import {generateAccessToken} from "@gafus/auth/jwt";
import {parseVersionedCourseEditorSnapshot}
 from "../../../../../apps/trainer-panel/src/trainer-vite/trainerCourseDraftReadContract";

const n=randomBytes(4).toString("hex");
const ownerId="ag1_join_owner_"+n,foreignId="ag1_join_foreign_"+n;
const adminId="ag1_join_admin_"+n,guestId="ag1_join_guest_"+n;
const dayId="ag1_join_day_"+n,courseId="ag1_join_course_"+n;
const jwt:Record<string,string>={};
const actors={
 A:{id:ownerId,username:ownerId,role:"TRAINER"},
 B:{id:foreignId,username:foreignId,role:"TRAINER"},
 ADMIN:{id:adminId,username:adminId,role:"ADMIN"},
 USER:{id:guestId,username:guestId,role:"USER"},
} as const;
const request=(who:string, suffix=courseId+"/editor-snapshot")=>
 app.request("/api/v1/trainer/courses/"+suffix,{
  method:"GET",headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
 });
const safe=(r:Response)=>{
 expect(r.headers.get("cache-control")).toContain("private");
 expect(r.headers.get("cache-control")).toContain("no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1" ||
  !process.env.DATABASE_URL?.includes("ag1_fullform") ||
  !process.env.DATABASE_URL?.includes(".ag1-course-pg/sock"))
   throw Error("REFUSE_NON_ISOLATED_DB");
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 m.registered.mockResolvedValue(true);
 for(const [alias,actor] of Object.entries(actors)){
  jwt[alias]=await generateAccessToken(actor);
  await prisma.user.create({data:{
   id:actor.id,username:actor.username,password:"test-only-password",
   role:actor.role as "USER"|"TRAINER"|"ADMIN",
  }});
 }
 await prisma.trainingDay.create({data:{
  id:dayId,authorId:ownerId,title:"Private trainer day",
 }});
 await prisma.course.create({data:{
  id:courseId,type:courseId,authorId:ownerId,
  name:"Private consistent course",description:"Description",
  shortDesc:"Short",duration:"5",logoImg:"",
  trainingLevel:"BEGINNER",isPrivate:true,
  dayLinks:{create:[{dayId,order:1}]},
  access:{create:[{userId:guestId}]},
 }});
});
afterAll(async()=>prisma.$disconnect());
describe("AG1 actual registered Hono + actual Core + own PG snapshot",()=>{
 it("owner signed JWT retrieves strict AG4 fields+version from real PG",async()=>{
  const r=await request("A");expect(r.status).toBe(200);safe(r);
  const body=await r.json();
  const dto=parseVersionedCourseEditorSnapshot(body,courseId);
  expect(dto.version).toBe(1);
  expect(dto.name).toBe("Private consistent course");
  expect(dto.dayLinks.map(x=>x.dayId)).toEqual([dayId]);
  expect(dto.access.map(x=>x.userId)).toEqual([guestId]);
  expect(Object.keys(dto)).toHaveLength(17);
  expect(JSON.stringify(body)).not.toContain("test-only-password");
 });
 it("foreign trainer gets 404 with no cross-owner disclosure",async()=>{
  const r=await request("B");expect(r.status).toBe(404);safe(r);
  expect(await r.json()).toEqual({
   success:false,code:"NOT_FOUND",error:"Курс не найден",
  });
 });
 it("ADMIN uses verified role to read cross-owner identical version",async()=>{
  const r=await request("ADMIN");expect(r.status).toBe(200);safe(r);
  const dto=parseVersionedCourseEditorSnapshot(await r.json(),courseId);
  expect(dto.version).toBe(1);
  expect(dto.dayLinks.map(x=>x.dayId)).toEqual([dayId]);
 });
 it("non trainer/admin blocked 403 before Course read",async()=>{
  const r=await request("USER");expect(r.status).toBe(403);safe(r);
  expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
 });
 it("guest 401 and forbidden query400 private before Core",async()=>{
  const guest=await request("");expect(guest.status).toBe(401);safe(guest);
  const query=await request("A",courseId+"/editor-snapshot?ownerId="+foreignId);
  expect(query.status).toBe(400);safe(query);
 });
});
