/** AG1 DB-only logo CAS -> actual Prisma -> own isolated PostgreSQL. */
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
import {prisma} from "@gafus/prisma";
vi.mock("@gafus/logger",()=>({
 createWebLogger:()=>({error:vi.fn(),info:vi.fn(),warn:vi.fn(),debug:vi.fn()}),
}));
vi.mock("../training/trainingDayContent",()=>({
 invalidateCourseContentCache:vi.fn(),
}));
vi.mock("../training/trainingContentRevision",()=>({
 publishCourseContentChange:vi.fn(),
}));
import {
 updateCourseLogoUrl,deleteCourseLogoFromRecord,
} from "./courseService";
const OWNER={id:"ag1_owner",role:"TRAINER"} as const;
const FOREIGN={id:"ag1_foreign",role:"TRAINER"} as const;
const ADMIN={id:"ag1_admin",role:"ADMIN"} as const;
const id="ag1_logo_course";
async function row(){
 const r=await prisma.$queryRaw<{logoImg:string;version:number}[]>`
 SELECT "logoImg","version" FROM "Course" WHERE "id"=${id}
 `;
 return r[0];
}
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1" ||
    !process.env.DATABASE_URL?.includes("ag1_fullform") ||
    !process.env.DATABASE_URL?.includes(".ag1-course-pg/sock"))
    throw Error("REFUSE_NON_ISOLATED_DB");
 await prisma.course.create({data:{
  id,name:"Scratch logo",type:"ag1-course-logo-test",
  description:"",shortDesc:"",duration:"3",logoImg:"/old.png",
  trainingLevel:"BEGINNER",authorId:OWNER.id,
 }});
});
afterAll(async()=>prisma.$disconnect());
describe("AG1 DB-only logo set/clear actual Prisma and SQL trigger",()=>{
 it("owner set CAS changes URL, returns previous and increments ONCE",async()=>{
  expect(await row()).toEqual({logoImg:"/old.png",version:1});
  expect(await updateCourseLogoUrl(id,"https://new.test/a.png",1,OWNER))
   .toMatchObject({success:true,version:2,previousLogoUrl:"/old.png"});
  expect(await row()).toEqual({logoImg:"https://new.test/a.png",version:2});
 });
 it("stale and foreign set never modify URL or version",async()=>{
  const before=await row();
  expect(await updateCourseLogoUrl(id,"https://bad.test/b.png",1,OWNER))
    .toMatchObject({success:false,code:"STALE_VERSION"});
  expect(await updateCourseLogoUrl(id,"https://bad.test/c.png",2,FOREIGN))
    .toMatchObject({success:false,code:"NOT_FOUND"});
  expect(await row()).toEqual(before);
 });
 it("clear is CAS, carries previous and increments exactly ONCE",async()=>{
  expect(await deleteCourseLogoFromRecord(id,2,OWNER))
    .toMatchObject({success:true,previousLogoUrl:"https://new.test/a.png",
      version:3});
  expect(await row()).toEqual({logoImg:"",version:3});
  expect(await deleteCourseLogoFromRecord(id,2,OWNER))
    .toMatchObject({success:false,code:"STALE_VERSION"});
  expect(await row()).toEqual({logoImg:"",version:3});
 });
 it("ADMIN may set across owners with verified role and one increment",async()=>{
  expect(await updateCourseLogoUrl(id,"https://admin.test/new.png",3,ADMIN))
    .toMatchObject({success:true,version:4,previousLogoUrl:null});
  expect(await row()).toEqual({logoImg:"https://admin.test/new.png",version:4});
 });
 it("missing caller revision/actor is rejected BEFORE DB modifications",async()=>{
  const before=await row();
  expect(await updateCourseLogoUrl(id,"https://bad.test/old.png",
    undefined as unknown as number,OWNER)).toMatchObject({
      success:false,code:"BAD_QUERY",
    });
  expect(await updateCourseLogoUrl(id,"https://bad.test/old.png",4,
    undefined as unknown as typeof OWNER)).toMatchObject({
      success:false,code:"BAD_QUERY",
    });
  expect(await row()).toEqual(before);
 });
});
