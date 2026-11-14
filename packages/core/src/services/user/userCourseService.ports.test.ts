import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({complete:vi.fn(),completeExisting:vi.fn(),count:vi.fn(),days:vi.fn(),trainings:vi.fn()}));
import { createUserCourseService } from "./userCourseService.js";
const { completeUserCourse, checkAndCompleteCourse, getDaysCountForCourse, getUserTrainingsForDays } =
  createUserCourseService({
    completeUserCourseRecord: m.complete,
    completeExistingUserCourseRecord: m.completeExisting,
    countCourseDays: m.count,
    readCourseDayIds: m.days,
    readOwnTrainingStatuses: m.trainings,
  });
beforeEach(()=>{
 vi.clearAllMocks();m.complete.mockResolvedValue({userId:"actor",status:"COMPLETED"});
 m.completeExisting.mockResolvedValue({userId:"actor",status:"COMPLETED"});
 m.count.mockResolvedValue(2);m.days.mockResolvedValue([{id:"day1"},{id:"day2"}]);
 m.trainings.mockResolvedValue([{dayOnCourseId:"day1",status:"COMPLETED"},{dayOnCourseId:"day2",status:"COMPLETED"}]);
});
describe("Core course-completion policy delegates persistence",()=>{
 it("completes only if all explicitly supplied days match the course count",async()=>{
  expect(await checkAndCompleteCourse("actor","course",{trainingDays:[{userStatus:"COMPLETED"},{userStatus:"COMPLETED"}]})).toEqual({success:true});
  expect(m.complete).toHaveBeenCalledExactlyOnceWith("actor","course");
  expect(m.completeExisting).not.toHaveBeenCalled();
 });
 it("fails if an explicit incomplete day is supplied",async()=>{
  expect(await checkAndCompleteCourse("actor","course",{trainingDays:[{userStatus:"NOT_STARTED"}]})).toEqual({success:false,reason:"Not all training days completed"});
  expect(m.count).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();
 });
 it("does not auto-complete when number of days differs",async()=>{
  expect(await checkAndCompleteCourse("actor","course",{trainingDays:[{userStatus:"COMPLETED"}]})).toEqual({success:false,reason:"Not all course days have trainings"});
  expect(m.complete).not.toHaveBeenCalled();
 });
 it("checks real training statuses then completes an EXISTING enrollment",async()=>{
  expect(await checkAndCompleteCourse("actor","course")).toEqual({success:true});
  expect(m.days).toHaveBeenCalledWith("course");
  expect(m.trainings).toHaveBeenCalledWith("actor",["day1","day2"]);
  expect(m.completeExisting).toHaveBeenCalledExactlyOnceWith("actor","course");
 });
 it("denies missing or incomplete training days",async()=>{
  m.days.mockResolvedValueOnce([]);
  expect(await checkAndCompleteCourse("actor","course")).toEqual({success:false,reason:"No days in course"});
  m.trainings.mockResolvedValueOnce([{dayOnCourseId:"day1",status:"COMPLETED"}]);
  expect(await checkAndCompleteCourse("actor","course")).toEqual({success:false,reason:"Not all days completed"});
  expect(m.completeExisting).not.toHaveBeenCalled();
 });
 it("preserves Core return shape for successful completion, counts and reads",async()=>{
  expect(await completeUserCourse("actor","course")).toMatchObject({success:true,data:{userId:"actor"}});
  expect(await getDaysCountForCourse("course")).toBe(2);
  expect((await getUserTrainingsForDays("actor",["day1"]))[0]?.status).toBe("COMPLETED");
 });
});
