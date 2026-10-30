// @vitest-environment node
/** AG4 TR012: actual source Core under MOCK Prisma; no SQL, API write or CDN. */
import {beforeEach,expect,it,vi} from "vitest";
import {classifyCurrentCoreWriteGuarantee,parseNameOnlyWriteProposal} from
 "./AG4TR012MetadataWriteContract20261022";
const m=vi.hoisted(()=>({
 find:vi.fn(),transaction:vi.fn(),update:vi.fn(),daysFind:vi.fn(),
 daysUpdate:vi.fn(),daysDelete:vi.fn(),daysCreate:vi.fn(),
 accessDelete:vi.fn(),accessCreate:vi.fn(),invalidate:vi.fn(),publish:vi.fn(),
}));
const tx={
 course:{update:m.update},
 dayOnCourse:{findMany:m.daysFind,update:m.daysUpdate,
  deleteMany:m.daysDelete,createMany:m.daysCreate},
 courseAccess:{deleteMany:m.accessDelete,createMany:m.accessCreate},
};
vi.mock("@gafus/prisma",()=>({prisma:{
 course:{findUnique:m.find},$transaction:m.transaction,
}}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({
 info:vi.fn(),warn:vi.fn(),error:vi.fn(),
})}));
vi.mock("@gafus/core/errors",()=>({handlePrismaError:vi.fn()}));
vi.mock("../../../../packages/core/src/services/training/trainingDayContent",()=>({
 invalidateCourseContentCache:m.invalidate,
}));
vi.mock("../../../../packages/core/src/services/training/trainingContentRevision",()=>({
 publishCourseContentChange:m.publish,
}));
const core="../../../../packages/core/src/services/trainerCourse/trainerCourseService";
const {updateCourse,trainerCanEditCourse,getCourseDraftWithRelations}=
 await vi.importActual<{
  updateCourse:(input:Record<string,unknown>)=>Promise<{success:boolean;error?:string}>;
  trainerCanEditCourse:(id:string,actor:string,opts?:{allowAdmin?:boolean})=>Promise<boolean>;
  getCourseDraftWithRelations:(id:string,actor:string)=>Promise<Record<string,unknown>|null>;
 }>(core);
const {updateTrainerCourseSchema}=await vi.importActual<{
 updateTrainerCourseSchema:{safeParse:(x:unknown)=>{success:boolean}},
}>("../../../../packages/core/src/services/trainerCourse/schemas");
const full=(name="Новое название")=>({
 id:"course_A",name,shortDesc:"Старое описание",description:"Описание",
 duration:"5 дней",guideContent:undefined,videoUrl:null,logoImg:"",
 isPublic:false,isPaid:false,showInProfile:true,isPersonalized:false,
 trainingDays:["day_A"],allowedUsers:["learner_A"],equipment:"",
 trainingLevel:"BEGINNER",
});
const ownerRow=()=>({
 id:"course_A",authorId:"trainer_A",name:"Старое название",shortDesc:"",
 description:"",duration:"5 дней",guideContent:null,videoUrl:null,
 logoImg:"",isPrivate:true,isPaid:false,showInProfile:true,
 isPersonalized:false,equipment:"",trainingLevel:"BEGINNER",
 updatedAt:new Date("2026-10-21T10:02:03.000Z"),dayLinks:[],access:[],
});
beforeEach(()=>{
 vi.clearAllMocks();
 m.transaction.mockImplementation(async(fn:(x:typeof tx)=>Promise<unknown>)=>fn(tx));
 m.find.mockResolvedValue(ownerRow());
 m.update.mockResolvedValue({});
 m.daysFind.mockResolvedValue([{id:"link_A",dayId:"day_A",order:1}]);
 m.daysUpdate.mockResolvedValue({});m.daysDelete.mockResolvedValue({count:0});
 m.daysCreate.mockResolvedValue({count:0});
 m.accessDelete.mockResolvedValue({count:1});
 m.accessCreate.mockResolvedValue({count:1});
 m.publish.mockResolvedValue(undefined);
});
it("actual Core update schema rejects name-only: full input required",()=>{
 expect(updateTrainerCourseSchema.safeParse({id:"course_A",name:"New"}).success)
  .toBe(false);
});
it("unscoped full form rejects before any SQL or relation write",async()=>{

 const response=await updateCourse(full());
 expect(response).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
it("unversioned name intention does not rewrite course days or grants",async()=>{

 const response=await updateCourse(full());
 expect(response).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
it("empty legacy relations cannot erase existing day/access before CAS",async()=>{

 const response=await updateCourse({...full(),trainingDays:[],allowedUsers:[]});
 expect(response).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
it("actual separate Core owner guard: own true, foreign false, trusted ADMIN bypass",async()=>{
 expect(await trainerCanEditCourse("course_A","trainer_A")).toBe(true);
 expect(await trainerCanEditCourse("course_A","trainer_B")).toBe(false);
 expect(await trainerCanEditCourse("course_A","admin_C",{allowAdmin:true})).toBe(true);
 expect(m.update).not.toHaveBeenCalled();
});
it("foreign owner guard cannot be bypassed by omitted actor",async()=>{
 expect(await trainerCanEditCourse("course_A","trainer_B")).toBe(false);
 const response=await updateCourse(full());
 expect(response).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
it("two stale unversioned editor submissions cannot overwrite each other",async()=>{

 const response=await updateCourse(full("Редактор A"));
 expect(response).toMatchObject({success:false,status:"invalid"});
 const second=await updateCourse(full("Редактор B"));
 expect(second).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
it("duplicate legacy writes cannot create repeated publication side effects",async()=>{

 const response=await updateCourse(full());
 expect(response).toMatchObject({success:false,status:"invalid"});
 const second=await updateCourse(full());
 expect(second).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
it("actual Core draft projection excludes existing Prisma updatedAt, so no If-Match token",async()=>{
 const draft=await getCourseDraftWithRelations("course_A","trainer_A");
 expect(draft).not.toBeNull();expect(draft).not.toHaveProperty("updatedAt");
 expect(draft).not.toHaveProperty("authorId");
 expect(draft).toHaveProperty("name","Старое название");
});
it("proposed name-only scope validates ID/name/observed revision and rejects others",()=>{
 const dto={courseId:"cuid_course_A",name:"Новое название",
  observedUpdatedAt:"2026-10-21T10:02:03.000Z"};
 expect(parseNameOnlyWriteProposal(dto)).toEqual(dto);
 for(const patch of [{logoImg:""},{trainingDays:[]},{allowedUsers:[]},
  {isPaid:true},{isPublic:true},{showInProfile:false},{authorId:"trainer_B"},
  {role:"ADMIN"},{idempotencyKey:"unapproved"}]){
  expect(()=>parseNameOnlyWriteProposal({...dto,...patch})).toThrow();
 }
});
it("proposed invalid input fails closed and never makes source write available",()=>{
 const ok={courseId:"course_A",name:"Name",
  observedUpdatedAt:"2026-10-21T10:02:03.000Z"};
 for(const invalid of [{...ok,name:""},{...ok,name:"x".repeat(501)},
  {...ok,courseId:"../foreign"},{...ok,observedUpdatedAt:"bad"},
  {...ok,observedUpdatedAt:"2026-25-89T10:02:03.000Z"}]){
  expect(()=>parseNameOnlyWriteProposal(invalid)).toThrow();
 }
 expect(classifyCurrentCoreWriteGuarantee()).toEqual({
  readyForHttpWrite:false,supportedNow:"READ_ONLY",
  requiredBeforeWrite:"ATOMIC_OWNER_AND_REVISION_CAS",
  replayPolicy:"NO_AUTOMATIC_RETRY_AFTER_UNKNOWN",
 });
 expect(m.update).not.toHaveBeenCalled();
});
it("owner transfer between separate checks cannot permit unscoped write",async()=>{
 expect(await trainerCanEditCourse("course_A","trainer_A")).toBe(true);
 m.find.mockResolvedValue({...ownerRow(),authorId:"trainer_B"});
 expect(await trainerCanEditCourse("course_A","trainer_A")).toBe(false);
 const response=await updateCourse(full("Нельзя сохранять"));
 expect(response).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
it("invalid legacy write cannot reach a simulated publication failure",async()=>{
 m.publish.mockRejectedValueOnce(Error("MOCK_CACHE_PUBLICATION_FAILED"));
 const response=await updateCourse(full("Проверка отказа"));
 expect(response).toMatchObject({success:false,status:"invalid"});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
 expect(m.daysDelete).not.toHaveBeenCalled();
 expect(m.accessDelete).not.toHaveBeenCalled();
 expect(m.publish).not.toHaveBeenCalled();
});
