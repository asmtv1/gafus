// @vitest-environment node
/** TR012 new Core→approved DTO boundary; source-backed, mocked Prisma, no mounted HTTP. */
import {beforeEach,expect,it,vi} from "vitest";
import {parseTrainerCourseDraftEnvelope} from "./trainerCourseDraftReadContract";
const m=vi.hoisted(()=>({find:vi.fn(),writes:vi.fn()}));
vi.mock("@gafus/prisma",()=>({
 prisma:{course:{findUnique:m.find,create:m.writes,update:m.writes,delete:m.writes},
  $transaction:m.writes},
}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({
 info:vi.fn(),warn:vi.fn(),error:vi.fn(),
})}));
vi.mock("@gafus/core/errors",()=>({handlePrismaError:vi.fn()}));
vi.mock("../../../../packages/core/src/services/training/trainingDayContent",()=>({
 invalidateCourseContentCache:vi.fn(),
}));
vi.mock("../../../../packages/core/src/services/training/trainingContentRevision",()=>({
 publishCourseContentChange:vi.fn(),
}));
// Runtime loads ACTUAL Core implementation without compiling server internals in Trainer tsconfig.
const corePath="../../../../packages/core/src/services/trainerCourse/trainerCourseService";
const {getCourseDraftWithRelations}=await vi.importActual<{
 getCourseDraftWithRelations:(id:string,actor:string,opts?:{allowAdmin?:boolean})=>
  Promise<unknown|null>,
}>(corePath);
const draft={
 id:"course-cuid-1",name:"Owned",shortDesc:"",guideContent:null,
 description:"",duration:"30",videoUrl:null,logoImg:"",
 isPrivate:true,isPaid:false,showInProfile:true,isPersonalized:false,
 equipment:"",trainingLevel:"BEGINNER",
 authorId:"trainer-A",dayLinks:[{
  id:"link-A",dayId:"day-A",order:1,day:{id:"day-A",title:"Day A"},
 }],access:[{userId:"user-A",user:{id:"user-A",username:"PRIVATE_LEARNER"}}],
};
beforeEach(()=>{vi.resetAllMocks();m.find.mockResolvedValue(draft);});
it("actual Core owner-safe DTO passes strict Vite draft schema, preserves ordered day/access",async()=>{
 const actual=await getCourseDraftWithRelations("course-cuid-1","trainer-A",{
  allowAdmin:false,
 });
 const parsed=parseTrainerCourseDraftEnvelope({success:true,data:actual},"course-cuid-1");
 expect(parsed).toMatchObject({name:"Owned",isPrivate:true,dayLinks:[{
  dayId:"day-A",order:1,
 }],access:[{userId:"user-A",user:{username:"PRIVATE_LEARNER"}}]});
 expect(JSON.stringify(parsed)).not.toContain("authorId");
 expect(m.find).toHaveBeenCalledWith({where:{id:"course-cuid-1"},
  select:expect.objectContaining({authorId:true,dayLinks:expect.any(Object),
   access:expect.any(Object)})});
 expect(m.writes).not.toHaveBeenCalled();
});
it("Core foreign TRAINER receives null; API must map to masked 404, not private DTO",async()=>{
 const actual=await getCourseDraftWithRelations("course-cuid-1","trainer-B",{
  allowAdmin:false,
 });
 expect(actual).toBeNull();expect(m.writes).not.toHaveBeenCalled();
});
it("only HTTP-authenticated ADMIN may cause allowAdmin=true: Core itself trusts this flag",async()=>{
 const actual=await getCourseDraftWithRelations("course-cuid-1","admin-C",{
  allowAdmin:true,
 });
 expect(parseTrainerCourseDraftEnvelope({success:true,data:actual},"course-cuid-1")
  .name).toBe("Owned");
 // Negative contract boundary: if AG1 passed allowAdmin=true for TRAINER,
 // Core would deliberately permit foreign access; AG1 must derive from JWT role.
 expect(m.writes).not.toHaveBeenCalled();
});
it("missing course Core returns null; no author/course existence oracle",async()=>{
 m.find.mockResolvedValueOnce(null);
 expect(await getCourseDraftWithRelations("missing","trainer-A",{
  allowAdmin:false,
 })).toBeNull();
 expect(m.writes).not.toHaveBeenCalled();
});
it("Core database error also returns null, not distinguishable from 404 by thin route",async()=>{
 m.find.mockRejectedValueOnce(Error("PRIVATE_DB_STACK"));
 expect(await getCourseDraftWithRelations("course-cuid-1","trainer-A",{
  allowAdmin:false,
 })).toBeNull();
 expect(m.writes).not.toHaveBeenCalled();
});
it("Core course with trailing fields is projected explicitly, never sent raw to client",async()=>{
 m.find.mockResolvedValueOnce({...draft,internalSecret:"PRIVATE_SECRET",userCourses:[{
  email:"PRIVATE_EMAIL",
 }]});
 const result=await getCourseDraftWithRelations("course-cuid-1","trainer-A",{
  allowAdmin:false,
 });
 const dto=parseTrainerCourseDraftEnvelope({success:true,data:result},"course-cuid-1");
 expect(JSON.stringify(dto)).not.toContain("PRIVATE_SECRET");
 expect(JSON.stringify(dto)).not.toContain("PRIVATE_EMAIL");
});
