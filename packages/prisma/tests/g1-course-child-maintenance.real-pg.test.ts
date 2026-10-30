/** Trusted seed helper actual Prisma -> OWN PG; never runs seed.ts itself. */
import { randomBytes } from "node:crypto";
import { beforeAll,afterAll,describe,expect,it } from "vitest";
import { prisma } from "../src";
import { insertSeedCourseDaysVersioned } from "../scripts/courseChildRevisionMaintenance";

const n=randomBytes(4).toString("hex");
const left="ag1_child_A_"+n,right="ag1_child_B_"+n;
const dayA="ag1_child_day_A_"+n,dayB="ag1_child_day_B_"+n;
const owner="ag1_owner";
const version=async(id:string)=>{
 const rows=await prisma.$queryRaw<{version:number}[]>`
 SELECT "version" FROM "Course" WHERE "id"=${id}
 `;
 return rows[0]?.version;
};
const links=async(id:string)=>(await prisma.dayOnCourse.findMany({
 where:{courseId:id},orderBy:{order:"asc"},
})).map(x=>({dayId:x.dayId,order:x.order}));

beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1" ||
    !process.env.DATABASE_URL?.includes("ag1_fullform") ||
    !process.env.DATABASE_URL?.includes(".ag1-course-pg/sock"))
  throw Error("REFUSE_NON_ISOLATED_DB");
 for(const id of [dayA,dayB])
  await prisma.trainingDay.create({data:{id,title:id,authorId:owner}});
 for(const id of [left,right])
  await prisma.course.create({data:{
    id,type:id,name:id,authorId:owner,description:"",
    shortDesc:"",duration:"3",logoImg:"",trainingLevel:"BEGINNER",
  }});
});
afterAll(async()=>prisma.$disconnect());
describe("AG1 seed child-only maintenance parent version touch real PG",()=>{
 it("two courses ordered deterministically, one version bump per parent batch",async()=>{
  expect(await version(left)).toBe(1);
  expect(await version(right)).toBe(1);
  await insertSeedCourseDaysVersioned(prisma,[
   {courseId:right,dayId:dayA,order:1},
   {courseId:left,dayId:dayA,order:1},
   {courseId:left,dayId:dayB,order:2},
  ]);
  expect(await version(left)).toBe(2);
  expect(await version(right)).toBe(2);
  expect(await links(left)).toEqual([
   {dayId:dayA,order:1},{dayId:dayB,order:2},
  ]);
  expect(await links(right)).toEqual([{dayId:dayA,order:1}]);
 });
 it("invalid child FK rolls back BOTH parent version bumps and all links",async()=>{
  await expect(insertSeedCourseDaysVersioned(prisma,[
   {courseId:left,dayId:"nonexistent_"+n,order:3},
   {courseId:right,dayId:dayB,order:2},
  ])).rejects.toThrow();
  expect(await version(left)).toBe(2);
  expect(await version(right)).toBe(2);
  expect(await links(left)).toHaveLength(2);
  expect(await links(right)).toHaveLength(1);
 });
 it("duplicate order/input guards reject before touching DB",async()=>{
  await expect(insertSeedCourseDaysVersioned(prisma,[
   {courseId:left,dayId:dayA,order:7},
   {courseId:left,dayId:dayB,order:7},
  ])).rejects.toThrow("DUPLICATE_SEED_COURSE_ORDER");
  await expect(insertSeedCourseDaysVersioned(prisma,[
   {courseId:"bad/course",dayId:dayA,order:1},
  ])).rejects.toThrow("INVALID_SEED_COURSE_DAY");
  expect(await version(left)).toBe(2);
  expect(await version(right)).toBe(2);
 });
});
