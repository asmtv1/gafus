/**
 * AG1 full-form real Prisma engine -> own isolated PostgreSQL 14.19.
 * Requires G1_AG1_OWN_PG=1 AND private DATABASE_URL containing ag1_fullform;
 * never runs against shared/production DB. No external provider/Redis.
 */
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
import {prisma} from "@gafus/prisma";
const hooks=vi.hoisted(()=>({invalidate:vi.fn(),publish:vi.fn()}));
vi.mock("../training/trainingDayContent",()=>({
  invalidateCourseContentCache:hooks.invalidate,
}));
vi.mock("../training/trainingContentRevision",()=>({
  publishCourseContentChange:hooks.publish,
}));
vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({
    error:vi.fn(),warn:vi.fn(),info:vi.fn(),debug:vi.fn(),
  }),
}));
import {updateCourse} from "./trainerCourseService";

const OWNER={id:"ag1_owner",role:"TRAINER"} as const;
const FOREIGN={id:"ag1_foreign",role:"TRAINER"} as const;
const ADMIN={id:"ag1_admin",role:"ADMIN"} as const;
const baseInput={
  id:"ag1_course_main",name:"Initial course",description:"",
  shortDesc:"",duration:"12",logoImg:"",videoUrl:null,
  isPublic:false,isPaid:false,showInProfile:true,
  isPersonalized:false,guideContent:null,
  equipment:"",trainingLevel:"BEGINNER" as const,
  trainingDays:["ag1_day_1"],allowedUsers:["ag1_member"],
};
async function state(){
  const course=await prisma.course.findUnique({
    where:{id:baseInput.id},include:{dayLinks:{orderBy:{order:"asc"}},
      access:{orderBy:{userId:"asc"}}},
  });
  if(!course)throw Error("own scratch course missing");
  const versionRows=await prisma.$queryRaw<{version:number}[]>`
    SELECT "version" FROM "Course" WHERE "id" = ${baseInput.id}
  `;
  return {
    name:course.name,logoImg:course.logoImg,description:course.description,
    days:course.dayLinks.map(x=>({id:x.dayId,order:x.order})),
    access:course.access.map(x=>x.userId),
    version:versionRows[0]?.version,
  };
}
beforeAll(async()=>{
  if(process.env.G1_AG1_OWN_PG!=="1"||
     !process.env.DATABASE_URL?.includes("ag1_fullform")||
     !process.env.DATABASE_URL?.includes(".ag1-course-pg/sock"))
    throw Error("REFUSE_NON_ISOLATED_DB");
  hooks.publish.mockResolvedValue(undefined);
  for(const id of [OWNER.id,FOREIGN.id,ADMIN.id,"ag1_member"]){
    await prisma.user.create({data:{
      id,username:id,email:id+"@invalid.example",password:"testonly",
    }});
  }
  for(const id of ["ag1_day_1","ag1_day_2"])
    await prisma.trainingDay.create({data:{id,title:id,authorId:OWNER.id}});
  await prisma.course.create({data:{
    id:baseInput.id,name:baseInput.name,type:"ag1-course-cas-test",
    description:baseInput.description,shortDesc:baseInput.shortDesc,
    duration:baseInput.duration,logoImg:"",trainingLevel:"BEGINNER",
    authorId:OWNER.id,isPrivate:true,
    dayLinks:{create:[{dayId:"ag1_day_1",order:1}]},
    access:{create:[{userId:"ag1_member"}]},
  }});
});
afterAll(async()=>{await prisma.$disconnect();});
describe("AG1 actual full-form CAS Prisma -> private PostgreSQL",()=>{
 it("starts at version1, foreign owner rejected before ANY child mutations",async()=>{
  expect((await state()).version).toBe(1);
  hooks.invalidate.mockClear();hooks.publish.mockClear();
  const result=await updateCourse({
    ...baseInput,name:"foreign overwrite",expectedVersion:1,
    trainingDays:["ag1_day_2"],allowedUsers:[],
  },FOREIGN);
  expect(result.success).toBe(false);
  expect(result.status).toBe("not_found");
  const current=await state();
  expect(current).toMatchObject({version:1,name:"Initial course",
    days:[{id:"ag1_day_1",order:1}],access:["ag1_member"]});
  expect(hooks.publish).not.toHaveBeenCalled();
 });
 it("exact owner CAS updates metadata + dayLinks/access in ONE transaction",async()=>{
  hooks.invalidate.mockClear();hooks.publish.mockClear();
  const result=await updateCourse({
    ...baseInput,expectedVersion:1,name:"Fullform v2",
    description:"Updated with children",trainingDays:["ag1_day_2"],
    allowedUsers:[],
  },OWNER);
  expect(result).toMatchObject({success:true,version:2});
  const current=await state();
  expect(current).toMatchObject({version:2,name:"Fullform v2",
    description:"Updated with children",
    days:[{id:"ag1_day_2",order:1}],access:[]});
  expect(hooks.publish).toHaveBeenCalledOnce();
  expect(hooks.invalidate).toHaveBeenCalledExactlyOnceWith(baseInput.id);
 });
 it("stale full-form cannot touch parent, days or access; no side effects",async()=>{
  const before=await state();
  hooks.invalidate.mockClear();hooks.publish.mockClear();
  const result=await updateCourse({
    ...baseInput,expectedVersion:1,name:"stale v1",
    trainingDays:["ag1_day_1"],allowedUsers:["ag1_member"],
  },OWNER);
  expect(result).toMatchObject({success:false,status:"stale"});
  expect(await state()).toEqual(before);
  expect(hooks.publish).not.toHaveBeenCalled();
  expect(hooks.invalidate).not.toHaveBeenCalled();
 });
 it("invalid child FK rolls back parent update and version increment",async()=>{
  const before=await state();
  hooks.invalidate.mockClear();hooks.publish.mockClear();
  const result=await updateCourse({
    ...baseInput,expectedVersion:2,name:"should rollback",
    trainingDays:["ag1_missing_day"],allowedUsers:[],
  },OWNER);
  expect(result.success).toBe(false);
  expect(await state()).toEqual(before);
  expect(hooks.publish).not.toHaveBeenCalled();
  expect(hooks.invalidate).not.toHaveBeenCalled();
 });
 it("simultaneous owner CAS has ONE winner, exactly ONE increment",async()=>{
  hooks.invalidate.mockClear();hooks.publish.mockClear();
  const before=await state();
  expect(before.version).toBe(2);
  const args={...baseInput,expectedVersion:2,
    trainingDays:["ag1_day_1"],allowedUsers:["ag1_member"]};
  const outcomes=await Promise.all([
    updateCourse({...args,name:"concurrent winner X"},OWNER),
    updateCourse({...args,name:"concurrent winner Y"},OWNER),
  ]);
  expect(outcomes.filter(x=>x.success)).toHaveLength(1);
  expect(outcomes.filter(x=>x.status==="stale")).toHaveLength(1);
  expect((await state()).version).toBe(3);
  expect(["concurrent winner X","concurrent winner Y"])
    .toContain((await state()).name);
  expect((await state()).days).toEqual([{id:"ag1_day_1",order:1}]);
  expect((await state()).access).toEqual(["ag1_member"]);
  expect(hooks.publish).toHaveBeenCalledTimes(1);
 });
 it("ADMIN can CAS cross-author using server role, still one bump",async()=>{
  hooks.invalidate.mockClear();hooks.publish.mockClear();
  const r=await updateCourse({
    ...baseInput,expectedVersion:3,name:"Admin v4",
    trainingDays:["ag1_day_2"],allowedUsers:[],
  },ADMIN);
  expect(r).toMatchObject({success:true,version:4});
  expect((await state()).version).toBe(4);
  expect(hooks.publish).toHaveBeenCalledOnce();
 });
});
