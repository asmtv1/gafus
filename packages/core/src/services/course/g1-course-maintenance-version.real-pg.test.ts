/**
 * Server-owned current writer shapes: rating Prisma.update, seed upsert(update)
 * and raw/bulk Prisma updateMany rely on the ONE database-owned trigger bump.
 * Isolated scratch only, not live seed or production.
 */
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {prisma} from "@gafus/prisma";
const author="ag1_owner";
const id="ag1_maintenance_course";
async function version(){
 const rows=await prisma.$queryRaw<{version:number}[]>`
 SELECT "version" FROM "Course" WHERE "id"=${id}
 `;
 return rows[0]?.version;
}
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1"||
    !process.env.DATABASE_URL?.includes("ag1_fullform")||
    !process.env.DATABASE_URL?.includes(".ag1-course-pg/sock"))
  throw Error("REFUSE_NON_ISOLATED_DB");
 await prisma.course.create({data:{
  id,name:"Server maintenance",type:"ag1-course-maintenance-test",
  description:"",shortDesc:"",duration:"5",logoImg:"",
  trainingLevel:"BEGINNER",authorId:author,
 }});
});
afterAll(async()=>prisma.$disconnect());
describe("AG1 server-owned Course writer trigger parity real PG",()=>{
 it("create begins at v1, rating recompute update advances once",async()=>{
  expect(await version()).toBe(1);
  await prisma.course.update({where:{id},data:{avgRating:4.5}});
  expect(await version()).toBe(2);
 });
 it("seed-like upsert existing-row branch advances exactly once",async()=>{
  await prisma.course.upsert({
   where:{type:"ag1-course-maintenance-test"},
   update:{name:"Seed existing maintenance"},
   create:{id:"should_not_create",type:"ag1-course-maintenance-test",
    name:"Unexpected",duration:"5",logoImg:"",trainingLevel:"BEGINNER",
    authorId:author},
  });
  expect(await version()).toBe(3);
 });
 it("bulk updateMany with one matching parent advances once",async()=>{
  const rows=await prisma.course.updateMany({where:{id},data:{shortDesc:"bulk"}});
  expect(rows.count).toBe(1);
  expect(await version()).toBe(4);
 });
 it("no-op Prisma update still advances exactly once per SQL UPDATE",async()=>{
  await prisma.course.update({where:{id},data:{name:"Seed existing maintenance"}});
  expect(await version()).toBe(5);
 });
});
