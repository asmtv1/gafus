import {describe,it,expect,afterEach,vi} from "vitest";
import {listTrainingDays,projectTrainingDays} from "./trainingDaysApi";
const item={
  trainingDayId:"day_01",dayOnCourseId:"dayLink_01",title:"День 1. Контакт",
  type:"practice",courseId:"course_01",userStatus:"IN_PROGRESS",
  estimatedDuration:12,theoryMinutes:8,equipment:"Поводок",
  isLocked:false,showCoursePathExport:false,rawUserName:"SECRET",
};
const response=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
const raw=(trainingDays:unknown[]=[item])=>({
  courseId:"course_01",courseDescription:"Знакомство",courseVideoUrl:"PRIVATE_SIGNED_URL",
  courseEquipment:"Поводок",courseTrainingLevel:"BEGINNER",
  courseIsPersonalized:false,userCoursePersonalization:{
    userDisplayName:"SECRET_CHILD",petName:"PRIVATE_PET",petGender:"male"},
  trainingDays,
});
afterEach(()=>vi.unstubAllGlobals());
describe("W2 scoped existing Hono GET training days projection",()=>{
  it("W2-T01 only known safe day fields; no private PII/media in Query DTO",()=>{
    const result=projectTrainingDays(raw());
    expect(result.days).toEqual([{
      trainingDayId:"day_01",dayOnCourseId:"dayLink_01",title:"День 1. Контакт",
      type:"practice",courseId:"course_01",userStatus:"IN_PROGRESS",
      estimatedDuration:12,theoryMinutes:8,equipment:"Поводок",isLocked:false,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE/);
    expect(result.requiresPersonalization).toBe(false);
  });
  it("W2-T02 exact same-origin authenticated GET, zero client write",async()=>{
    const fetch=vi.fn().mockResolvedValue(response(raw()));
    vi.stubGlobal("fetch",fetch);
    const result=await listTrainingDays("obedience_01");
    expect(result.days).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/training/days?type=obedience_01");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method:"GET",credentials:"include",cache:"no-store",
    });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it("W2-T03 forged URL/protocol input rejected before any fetch",async()=>{
    const fetch=vi.fn();
    vi.stubGlobal("fetch",fetch);
    for(const candidate of ["../../admin","https://bad.example","DOG?ownerId=B","a b",""]){
      await expect(listTrainingDays(candidate)).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("W2-T04 invalid statuses, measurements, owner links fail closed",()=>{
    for(const delta of [
      {userStatus:"UNCONFIRMED"},{isLocked:"no"},{estimatedDuration:-1},
      {theoryMinutes:1.5},{courseId:"other_id"},{title:""},
      {dayOnCourseId:"../invalid"},
    ]){
      expect(()=>projectTrainingDays(raw([{...item,...delta}]))).toThrow();
    }
    expect(()=>projectTrainingDays(raw([item,item]))).toThrow(/DUPLICATE/);
  });
  it("W2-T05 valid empty set is not an error; no course/metadata leak",()=>{
    const empty=projectTrainingDays({...raw([]),courseId:null,
      courseDescription:null,courseEquipment:null,courseTrainingLevel:null});
    expect(empty.days).toEqual([]);
    expect(empty.courseId).toBeNull();
  });
  it("W2-T06 personalized course without user data is server-owned gate",()=>{
    const result=projectTrainingDays({...raw(),courseIsPersonalized:true,
      userCoursePersonalization:null});
    expect(result.requiresPersonalization).toBe(true);
  });
});
