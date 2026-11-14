import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({transaction:vi.fn(),actor:vi.fn(),revision:vi.fn(),course:vi.fn()}));
vi.mock("@gafus/prisma",()=>({
  Prisma:{TransactionIsolationLevel:{RepeatableRead:"RepeatableRead"}},
  prisma:{$transaction:m.transaction},
}));
import {readCourseEditorSnapshot} from "./editorSnapshot.js";
const draft={
 id:"course-A",name:"Authorized",guideContent:null,shortDesc:"Short",description:"description",duration:"7",
 videoUrl:null,logoImg:"",isPrivate:true,isPaid:false,showInProfile:true,isPersonalized:false,
 equipment:"",trainingLevel:"BEGINNER",dayLinks:[{id:"link",dayId:"day",order:1,day:{id:"day",title:"Day"}}],
 access:[{userId:"member",user:{id:"member",username:"member"}}],
};
beforeEach(()=>{
 vi.clearAllMocks();m.actor.mockResolvedValue({role:"TRAINER",registrationPending:false});m.revision.mockResolvedValue([{version:7}]);m.course.mockResolvedValue(draft);
 m.transaction.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({
  user:{findUnique:m.actor},$queryRaw:m.revision,course:{findFirst:m.course},
 }));
});
describe("course editor repeatable-read snapshot with current persisted role",()=>{
 it("requires valid trainer actor role and identifier before SQL",async()=>{
  expect(await readCourseEditorSnapshot("bad/id",{id:"trainer",role:"TRAINER"})).toEqual({status:"invalid"});
  expect(await readCourseEditorSnapshot("course-A",{id:"trainer",role:"USER"})).toEqual({status:"invalid"});
  expect(m.transaction).not.toHaveBeenCalled();
 });
 it("verifies current role inside exact same RepeatableRead transaction",async()=>{
  const result=await readCourseEditorSnapshot("course-A",{id:"trainer",role:"TRAINER"});
  expect(result).toMatchObject({status:"found",data:{id:"course-A",version:7,name:"Authorized"}});
  expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"RepeatableRead",maxWait:10000,timeout:20000,
  });
  expect(m.actor).toHaveBeenCalledWith({where:{id:"trainer"},select:{role:true,registrationPending:true}});
  expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.revision.mock.invocationCallOrder[0]);
  expect(m.course).toHaveBeenCalledWith(expect.objectContaining({where:{id:"course-A",authorId:"trainer"}}));
 });
 it("rejects demoted, unregistered or absent staff without reading any course",async()=>{
  for(const saved of [{role:"USER",registrationPending:false},{role:"TRAINER",registrationPending:true},null]){
   m.actor.mockResolvedValueOnce(saved);
   expect(await readCourseEditorSnapshot("course-A",{id:"trainer",role:"TRAINER"})).toEqual({status:"not_found"});
  }
  expect(m.revision).not.toHaveBeenCalled();expect(m.course).not.toHaveBeenCalled();
 });
 it("allows current admin to read a course without authorId bypass for demoted actor",async()=>{
  m.actor.mockResolvedValueOnce({role:"ADMIN",registrationPending:false});
  expect((await readCourseEditorSnapshot("course-A",{id:"admin",role:"ADMIN"})).status).toBe("found");
  expect(m.course.mock.calls[0]?.[0]?.where).toEqual({id:"course-A"});
  m.actor.mockResolvedValueOnce({role:"TRAINER",registrationPending:false});
  expect(await readCourseEditorSnapshot("course-A",{id:"admin",role:"ADMIN"})).toEqual({status:"not_found"});
  expect(m.course).toHaveBeenCalledTimes(1);
 });
 it("not found, invalid version and query errors never leak private course DTOs",async()=>{
  m.revision.mockResolvedValueOnce([]);
  expect(await readCourseEditorSnapshot("course-A",{id:"trainer",role:"TRAINER"})).toEqual({status:"not_found"});
  m.revision.mockResolvedValueOnce([{version:0}]);
  expect(await readCourseEditorSnapshot("course-A",{id:"trainer",role:"TRAINER"})).toEqual({status:"unknown"});
  m.course.mockRejectedValueOnce(new Error("SQL_SELECT_FAILED"));
  expect(await readCourseEditorSnapshot("course-A",{id:"trainer",role:"TRAINER"})).toEqual({status:"unknown"});
 });
});
