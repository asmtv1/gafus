import {describe,it,expect,vi} from "vitest";
import {scheduleQuestionsV2Cleanup} from "./questionV2Cleanup.js";
const at=new Date("2026-11-07T12:00:00Z");
describe("Question V2 signed upload cleanup server persistence",()=>{
 it("empty photo selection never queries or updates any task",async()=>{
  const findMany=vi.fn(),update=vi.fn();
  await scheduleQuestionsV2Cleanup({questionV2MediaTask:{findMany,update}} as never,[],at);
  expect(findMany).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
 });
 it("deduplicates photoId and waits for both signed POST validity and active worker lease",async()=>{
  const findMany=vi.fn().mockResolvedValue([{
   mediaId:"m1",status:"PROCESSING",createdAt:new Date(at.getTime()-9*60_000),
   leaseUntil:new Date(at.getTime()+6*60_000),
  }]);
  const update=vi.fn().mockResolvedValue({});
  await scheduleQuestionsV2Cleanup({questionV2MediaTask:{findMany,update}} as never,["photo","photo"],at);
  expect(findMany).toHaveBeenCalledWith({where:{photoId:{in:["photo"]}},select:{mediaId:true,status:true,createdAt:true,leaseUntil:true}});
  expect(update).toHaveBeenCalledExactlyOnceWith({where:{mediaId:"m1"},data:{
   status:"EXPIRED",attemptToken:null,leaseUntil:null,errorCode:"PHOTO_REMOVED",
   cleanupKind:"ALL",cleanupCompletedAt:null,cleanupToken:null,cleanupLeaseUntil:null,
   cleanupNextAt:new Date(at.getTime()+7*60_000),
  }});
 });
 it("expired lease only waits for signed-POST replay plus safety margin",async()=>{
  const created=new Date(at.getTime()-3*60_000);
  const findMany=vi.fn().mockResolvedValue([{mediaId:"m2",createdAt:created,leaseUntil:null,status:"READY"}]);
  const update=vi.fn();
  await scheduleQuestionsV2Cleanup({questionV2MediaTask:{findMany,update}} as never,["photo"],at);
  expect(update.mock.calls[0]?.[0].data.cleanupNextAt).toEqual(new Date(created.getTime()+11*60_000));
 });
});
