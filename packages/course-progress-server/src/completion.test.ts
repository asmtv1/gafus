import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({tx:vi.fn(),lock:vi.fn(),find:vi.fn(),update:vi.fn(),create:vi.fn(),count:vi.fn(),days:vi.fn(),trainings:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  $transaction:m.tx,dayOnCourse:{count:m.count,findMany:m.days},userTraining:{findMany:m.trainings},
}}));
import {completeUserCourseRecord,completeExistingUserCourseRecord,countCourseDays,readCourseDayIds,readOwnTrainingStatuses} from "./completion.js";
const completedAt=new Date("2026-11-06T09:00:00Z");
beforeEach(()=>{
 vi.clearAllMocks();m.lock.mockResolvedValue([{id:"learner"}]);m.find.mockResolvedValue(null);
 m.update.mockResolvedValue({userId:"learner",completedAt});m.create.mockResolvedValue({userId:"learner",completedAt});
 m.count.mockResolvedValue(2);m.days.mockResolvedValue([{id:"day-1"},{id:"day-2"}]);m.trainings.mockResolvedValue([]);
 m.tx.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({
  $queryRaw:m.lock,userCourse:{findUnique:m.find,update:m.update,create:m.create},
 }));
});
describe("course completion owner-scoped persistence",()=>{
 it("requires a real owner and course before opening transactions",async()=>{
  await expect(completeUserCourseRecord("","course")).rejects.toThrow("COURSE_COMPLETION_ACTOR_AND_COURSE_REQUIRED");
  await expect(completeExistingUserCourseRecord("learner","")).rejects.toThrow("COURSE_COMPLETION_ACTOR_AND_COURSE_REQUIRED");
  expect(m.tx).not.toHaveBeenCalled();
 });
 it("locks authenticated learner BEFORE creating a completed enrollment",async()=>{
  expect(await completeUserCourseRecord("learner","course")).toMatchObject({userId:"learner"});
  expect(m.create).toHaveBeenCalledExactlyOnceWith({data:{userId:"learner",courseId:"course",status:"COMPLETED",completedAt:expect.any(Date)}});
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
 });
 it("does not commit anything if owner is not found or registration is pending",async()=>{
  m.lock.mockResolvedValueOnce([]);
  await expect(completeUserCourseRecord("learner","course")).rejects.toThrow("COURSE_COMPLETION_ACTOR_UNAVAILABLE");
  expect(m.find).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it("preserves original completion timestamp on duplicate attempts",async()=>{
  const row={userId:"learner",courseId:"course",completedAt};m.find.mockResolvedValueOnce(row);
  expect(await completeUserCourseRecord("learner","course")).toBe(row);
  expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it("updates an existing noncompleted enrollment once",async()=>{
  m.find.mockResolvedValueOnce({userId:"learner",courseId:"course",completedAt:null});
  await completeUserCourseRecord("learner","course");
  expect(m.update).toHaveBeenCalledExactlyOnceWith({where:{userId_courseId:{userId:"learner",courseId:"course"}},data:{status:"COMPLETED",completedAt:expect.any(Date)}});
  expect(m.create).not.toHaveBeenCalled();
 });
 it("does not silently enroll an unstarted learner on the existing-only path",async()=>{
  await expect(completeExistingUserCourseRecord("learner","course")).rejects.toThrow("COURSE_ENROLLMENT_NOT_FOUND");
  expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it("checks course ID and learner ID at SQL read boundary",async()=>{
  expect(await countCourseDays("course")).toBe(2);
  expect(m.count).toHaveBeenCalledExactlyOnceWith({where:{courseId:"course"}});
  expect(await readCourseDayIds("course")).toEqual([{id:"day-1"},{id:"day-2"}]);
  expect(m.days).toHaveBeenCalledExactlyOnceWith({where:{courseId:"course"},select:{id:true},orderBy:{order:"asc"}});
  await readOwnTrainingStatuses("learner",["day-1","day-1","day-2"]);
  expect(m.trainings).toHaveBeenCalledExactlyOnceWith({where:{userId:"learner",dayOnCourseId:{in:["day-1","day-2"]}},select:{dayOnCourseId:true,status:true}});
 });
 it("missing actor/days do not issue broad training queries",async()=>{
  expect(await readOwnTrainingStatuses("",["day-1"])).toEqual([]);
  expect(await readOwnTrainingStatuses("learner",[])).toEqual([]);
  expect(await readCourseDayIds("")).toEqual([]);
  expect(await countCourseDays("")).toBe(0);
  expect(m.trainings).not.toHaveBeenCalled();expect(m.days).not.toHaveBeenCalled();expect(m.count).not.toHaveBeenCalled();
 });
});
