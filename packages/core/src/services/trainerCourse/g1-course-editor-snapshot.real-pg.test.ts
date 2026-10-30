/** ACTUAL Core -> Prisma REPEATABLE READ -> OWN isolated PostgreSQL.
 * Uses AG4 unmodified strict parser; no provider, queue, production DB.
 */
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
import {randomBytes} from "node:crypto";
import {prisma} from "@gafus/prisma";
const hooks=vi.hoisted(()=>({invalidate:vi.fn(),publish:vi.fn()}));
vi.mock("../training/trainingDayContent",()=>({
 invalidateCourseContentCache:hooks.invalidate,
}));
vi.mock("../training/trainingContentRevision",()=>({
 publishCourseContentChange:hooks.publish,
}));
vi.mock("@gafus/logger",()=>({
 createWebLogger:()=>({info:vi.fn(),error:vi.fn(),warn:vi.fn(),debug:vi.fn()}),
}));
import {getCourseEditorSnapshot} from "./courseEditorSnapshotService";
import {updateCourse} from "./trainerCourseService";
import {parseVersionedCourseEditorSnapshot}
 from "../../../../../apps/trainer-panel/src/trainer-vite/trainerCourseDraftReadContract";
const nonce=randomBytes(4).toString("hex");
const id="ag1_snap_course_"+nonce, owner={id:"ag1_snap_owner_"+nonce,role:"TRAINER"};
const foreign={id:"ag1_snap_foreign_"+nonce,role:"TRAINER"};
const admin={id:"ag1_snap_admin_"+nonce,role:"ADMIN"};
const guest="ag1_snap_guest_"+nonce, dayA="ag1_snap_day_A_"+nonce,
  dayB="ag1_snap_day_B_"+nonce;
const base={id,name:"Snapshot First",description:"Description",shortDesc:"Short",
 duration:"21",logoImg:"",videoUrl:null,guideContent:"Guide",
 isPublic:false,isPaid:false,showInProfile:true,isPersonalized:false,
 trainingDays:[dayA],allowedUsers:[guest],
 equipment:"",trainingLevel:"BEGINNER" as const};
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1" ||
  !process.env.DATABASE_URL?.includes("ag1_fullform") ||
  !process.env.DATABASE_URL?.includes(".ag1-course-pg/sock"))
   throw Error("REFUSE_NON_ISOLATED_DB");
 hooks.publish.mockResolvedValue(undefined);
 for(const uid of [owner.id,foreign.id,admin.id,guest])
  await prisma.user.create({data:{
   id:uid,username:uid,email:uid+"@invalid.example",password:"test-secret",
  }});
 for(const dayId of [dayA,dayB])
  await prisma.trainingDay.create({data:{id:dayId,title:dayId,authorId:owner.id}});
 await prisma.course.create({data:{
  id,name:base.name,type:"ag1-snapshot-probe-"+nonce,
  description:base.description,shortDesc:base.shortDesc,duration:base.duration,
  logoImg:"",trainingLevel:"BEGINNER",authorId:owner.id,isPrivate:true,
  guideContent:base.guideContent,
  dayLinks:{create:[{dayId:dayA,order:1}]},
  access:{create:[{userId:guest}]},
 }});
});
afterAll(async()=>prisma.$disconnect());
describe("AG1 TR012 Core editor snapshot actual Prisma/PG",()=>{
 it("strict AG4 parser accepts ONE owner snapshot with version/day/access",async()=>{
  const found=await getCourseEditorSnapshot(id,owner);
  expect(found.status).toBe("found");
  if(found.status!=="found")throw Error("missing");
  const snap=parseVersionedCourseEditorSnapshot({success:true,data:found.data},id);
  expect(snap.version).toBe(1);
  expect(snap.name).toBe("Snapshot First");
  expect(snap.dayLinks.map(x=>x.dayId)).toEqual([dayA]);
  expect(snap.access.map(x=>x.userId)).toEqual([guest]);
  expect(Object.keys(snap)).toHaveLength(17);
  expect(JSON.stringify(snap)).not.toContain("test-secret");
 });
 it("foreign/missing have no data, verified ADMIN sees existing",async()=>{
  expect(await getCourseEditorSnapshot(id,foreign)).toEqual({status:"not_found"});
  expect(await getCourseEditorSnapshot("missing",owner)).toEqual({status:"not_found"});
  const found=await getCourseEditorSnapshot(id,admin);
  expect(found.status).toBe("found");
  if(found.status!=="found")throw Error("admin read missing");
  expect(parseVersionedCourseEditorSnapshot({success:true,data:found.data},id).version)
   .toBe(1);
 });
 it("full-form atomic CAS updates parent + relations and coherent snapshot",async()=>{
  const saved=await updateCourse({...base,expectedVersion:1,
   name:"Snapshot Second",trainingDays:[dayB],allowedUsers:[],
  },owner);
  expect(saved).toMatchObject({success:true,version:2});
  const found=await getCourseEditorSnapshot(id,owner);
  expect(found.status).toBe("found");
  if(found.status!=="found")throw Error("after-save missing");
  const snap=parseVersionedCourseEditorSnapshot({success:true,data:found.data},id);
  expect(snap).toMatchObject({name:"Snapshot Second",version:2});
  expect(snap.dayLinks.map(x=>x.dayId)).toEqual([dayB]);
  expect(snap.access).toEqual([]);
 });
 it("invalid role/id rejected before DB",async()=>{
  expect(await getCourseEditorSnapshot(id,{id:owner.id,role:"USER"}))
   .toEqual({status:"invalid"});
  expect(await getCourseEditorSnapshot("bad/path",owner))
   .toEqual({status:"invalid"});
 });
});
