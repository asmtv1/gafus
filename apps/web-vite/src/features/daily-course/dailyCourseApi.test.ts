import {afterEach,describe,expect,it,vi} from "vitest";
import {getTodayDailyCourse,projectDailyToday,projectDailyDay,
  sourceOnlyDailyDayGet,type DailyToday} from "./dailyCourseApi";
const today:DailyToday={
  mskDate:"2026-10-17",scheduleId:"schedule_A",
  userStatus:"IN_PROGRESS",
  day:{id:"bundle_1",title:"Работа с возбуждением",
    description:"Первые упражнения",type:"training",
    estimatedDuration:9,theoryMinutes:3,stepsCount:2},
  stepsSummary:{total:2,completed:1},
};
const step=(i:number,type:"THEORY"|"PRACTICE",override:Record<string,unknown>={})=>({
  id:"userstep_"+i,stepId:"step_"+i,stepIndex:i,
  status:i===0?"COMPLETED":"NOT_STARTED",
  remainingSec:null,completedAt:null,
  isPausedOnServer:false,
  step:{id:"step_"+i,title:i===0?"Теория":"Практика",
    description:"Задание",type,durationSec:90,estimatedDurationSec:null,
    videoUrl:"https://cdn.example.com/video.mp4",
    imageUrls:["/api/v1/media/a.png"],pdfUrls:[],
    checklist:null,order:i},
  rawSecret:"PRIVATE_SESSION",
  ...override,
});
const day=(steps:unknown[]=[step(0,"THEORY"),step(1,"PRACTICE")])=>({
  scheduleId:today.scheduleId,mskDate:today.mskDate,
  trainingDayId:today.day?.id,bundleId:today.day?.id,
  title:"Работа с возбуждением",description:"День 1: упражнения",
  type:"training",userStatus:"IN_PROGRESS",steps,
  rawOtherUser:"SECRET_B",
});
afterEach(()=>vi.unstubAllGlobals());
describe("W2 daily-course literal Hono read-only client and data projection",()=>{
  it("DC-A01 uses exactly GET /today with cookie/no-store and no mutation",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:today,
    }),{status:200}));
    vi.stubGlobal("fetch",fetch);
    expect(await getTodayDailyCourse()).toEqual(today);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/daily-course/today");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method:"GET",credentials:"include",cache:"no-store",
    });
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it("DC-A02 Hono /today null means unpublished, not synthetic fallback",()=>{
    expect(projectDailyToday({
      mskDate:"2026-10-17",scheduleId:null,
      userStatus:"NOT_STARTED",day:null,stepsSummary:{total:0,completed:0},
    }).day).toBeNull();
    expect(()=>projectDailyToday({...today,scheduleId:null})).toThrow();
  });
  it("DC-A03 Moscow date invalid; client never guesses timezone/date",()=>{
    for(const mskDate of ["2026-02-30","today","2026-2-3","2030-13-31"]){
      expect(()=>projectDailyToday({...today,mskDate})).toThrow();
    }
  });
  it("DC-A04 wrong counts and missing IDs are denied",()=>{
    expect(()=>projectDailyToday({
      ...today,stepsSummary:{total:2,completed:3},
    })).toThrow();
    expect(()=>projectDailyToday({...today,
      day:{...today.day,stepsCount:3}})).toThrow();
    expect(()=>projectDailyToday({...today,scheduleId:"../danger"})).toThrow();
  });
  it("DC-A05 projects server steps and strips userStepId/PII/pdfs",()=>{
    const data=projectDailyDay(day(),today);
    expect(data.steps).toHaveLength(2);
    expect(data.steps[0]).toMatchObject({
      title:"Теория",type:"THEORY",status:"COMPLETED",durationSec:90,
    });
    expect(data.steps[1].videoUrl).toBe("https://cdn.example.com/video.mp4");
    expect(JSON.stringify(data)).not.toMatch(/PRIVATE_SESSION|SECRET_B|userstep_/);
  });
  it("DC-A06 day must match active server-issued schedule/date/bundle",()=>{
    for(const changed of [
      {scheduleId:"another"},{mskDate:"2026-10-16"},
      {trainingDayId:"another"},{bundleId:"another"},
    ])expect(()=>projectDailyDay({...day(),...changed},today)).toThrow();
    expect(()=>projectDailyDay(day(),{...today,scheduleId:null,day:null})).toThrow();
  });
  it("DC-A07 duplicate or mismatched step, invalid status and types fail closed",()=>{
    for(const changed of [
      {stepId:"other"},{stepIndex:2},{status:"FAKE"},
      {step:{...step(0,"THEORY").step,type:"MALICIOUS"}},
      {step:{...step(0,"THEORY").step,durationSec:-1}},
    ])expect(()=>projectDailyDay(day([
      step(0,"THEORY",changed),step(1,"PRACTICE"),
    ]),today)).toThrow();
    expect(()=>projectDailyDay(day([step(0,"THEORY"),step(0,"THEORY")]),today))
      .toThrow();
  });
  it("DC-A08 media safe scheme filtering and source-only request exact false",async()=>{
    const altered=day([
      step(0,"THEORY",{step:{...step(0,"THEORY").step,
        videoUrl:"javascript:alert(1)",imageUrls:[
          "data:image/svg+xml,bad","https://cdn.example.com/ok.png",
        ]}}),
      step(1,"PRACTICE"),
    ]);
    const data=projectDailyDay(altered,today);
    expect(data.steps[0].videoUrl).toBeNull();
    expect(data.steps[0].imageUrls).toEqual(["https://cdn.example.com/ok.png"]);
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:day(),
    }),{status:200}));
    vi.stubGlobal("fetch",fetch);
    const result=await sourceOnlyDailyDayGet(today);
    expect(result.steps).toHaveLength(2);
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/v1/daily-course/day?scheduleId=schedule_A&createIfMissing=false");
    expect(fetch.mock.calls[0][1].method).toBe("GET");
    // Source-only mocked transport: backend Core GET can still mutate existing rows.
  });
});
