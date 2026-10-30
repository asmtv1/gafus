import {afterEach,describe,expect,it,vi} from "vitest";
import {getTrainingDay,projectTrainingDay,safeStepMediaUrl,
  postTrainingOnlineStep, type TrainingOnlineStepCommand} from "./trainingDayApi";
import type {TrainingDaySummary} from "./trainingDaysApi";
const link="clwdayoc0000000000000001";
const day:TrainingDaySummary={
  trainingDayId:"day_01",dayOnCourseId:link,courseId:"course_01",
  title:"Основы",type:"practice",userStatus:"IN_PROGRESS",
  estimatedDuration:10,theoryMinutes:4,equipment:"Поводок",isLocked:false,
};
const step=(overrides:Record<string,unknown>={})=>({
  id:"step_01",title:"Изучаем правила",description:"Текст теории",
  type:"THEORY",status:"NOT_STARTED",order:0,durationSec:90,locked:false,
  videoUrl:"https://cdn.example.com/step.mp4",
  imageUrls:["/api/v1/training/image/preview.png"],
  userStepId:"SECRET_USER_STEP_ID",
  monetizationTarget:{targetId:"PRIVATE_UNLOCK"},
  ...overrides,
});
const raw=(steps:unknown[]=[step()])=>({
  trainingDayId:day.trainingDayId,dayOnCourseId:day.dayOnCourseId,
  courseId:day.courseId,title:"Основы",type:"practice",
  description:"Описание блока",userStatus:"IN_PROGRESS",steps,
  userId:"SECRET_ACTOR",showCoursePathExport:true,
});
afterEach(()=>vi.unstubAllGlobals());
describe("W2 training day read-only contract and owner-scoped projection",()=>{
  it("D01 exact cookie GET with createIfMissing=false, no Hono mutations",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:raw(),
    }),{status:200}));
    vi.stubGlobal("fetch",fetch);
    const result=await getTrainingDay("IMPULSE_CONTROL",day);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url,options]=fetch.mock.calls[0];
    expect(url).toBe("/api/v1/training/day?courseType=IMPULSE_CONTROL&"+
      "dayOnCourseId="+link+"&createIfMissing=false");
    expect(options).toMatchObject({method:"GET",credentials:"include",cache:"no-store"});
    expect(JSON.stringify(options)).not.toMatch(/Authorization|Idempotency-Key/);
    expect(result.steps).toHaveLength(1);
  });
  it("D02 strips userStepId, monetization and private fields",()=>{
    const result=projectTrainingDay(raw(),day);
    expect(result.steps[0]).toMatchObject({
      title:"Изучаем правила",type:"THEORY",description:"Текст теории",
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET_|PRIVATE_UNLOCK/);
  });
  it("D03 deny direct view for locked day before network request",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(getTrainingDay("IMPULSE_CONTROL",{...day,isLocked:true}))
      .rejects.toThrow(/INVALID_OR_LOCKED/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("D04 reject wrong day/course/IDs and malformed steps",()=>{
    for(const override of [
      {courseId:"other"},{dayOnCourseId:"other"},{trainingDayId:"../invalid"},
    ])expect(()=>projectTrainingDay({...raw(),...override},day)).toThrow();
    for(const override of [
      {status:"INVALID"},{type:"FAKE"},{durationSec:-1},{locked:"yes"},
      {order:1.5},{description:12},
    ])expect(()=>projectTrainingDay(raw([step(override)]),day)).toThrow();
    expect(()=>projectTrainingDay(raw([step(),step()]),day)).toThrow();
  });
  it("D04b real Core uses physical Day.id and repeats template Step.id across distinct positions",()=>{
    const actual=raw([step({id:"template",order:0}),step({id:"template",order:9}),
      step({id:"other",order:21})]);
    actual.trainingDayId="physical_day_01";
    const projected=projectTrainingDay(actual,day);
    expect(projected.trainingDayId).toBe("physical_day_01");
    expect(projected.dayOnCourseId).toBe(day.dayOnCourseId);
    expect(projected.steps.map(item=>item.order)).toEqual([0,9,21]);
    expect(()=>projectTrainingDay(raw([step({id:"template",order:0}),
      step({id:"other",order:0})]),day)).toThrow();
  });
  it("Next estimated duration only projects safe unlocked source values", () => {
    const read=projectTrainingDay(raw([step({type:"PRACTICE",
      estimatedDurationSec:178})]),day);
    expect(read.steps[0].estimatedDurationSec).toBe(178);
    expect(projectTrainingDay(raw([step({locked:true,
      estimatedDurationSec:178})]),day).steps[0].estimatedDurationSec).toBeUndefined();
    for(const invalid of [-1,1.4,"5",Number.MAX_SAFE_INTEGER+1]){
      expect(()=>projectTrainingDay(raw([step({estimatedDurationSec:invalid})]),day))
        .toThrow("INVALID_TRAINING_STEP");
    }
  });
  it("source SURVEY exposes only unlocked validated template slug, never userStep ID",()=>{
    const rawSurvey=step({type:"SURVEY",surveySlug:"separation-anxiety-screening",order:0});
    const projected=projectTrainingDay(raw([rawSurvey]),day);
    expect(projected.steps[0].surveySlug).toBe("separation-anxiety-screening");
    expect(JSON.stringify(projected)).not.toContain("SECRET_USER_STEP_ID");
    const locked=projectTrainingDay(raw([step({type:"SURVEY",locked:true,
      surveySlug:"separation-anxiety-screening"})]),day);
    expect(locked.steps[0].surveySlug).toBeUndefined();
    for(const bad of ["bad/path","../secret", "https://evil.example", "white space"]){
      expect(()=>projectTrainingDay(raw([step({type:"SURVEY",surveySlug:bad})]),day))
        .toThrow("INVALID_TRAINING_SURVEY_SLUG");
    }
  });
  it("D05 locked step forcibly redacted even if producer returns content",()=>{
    const result=projectTrainingDay(raw([step({
      locked:true,description:"SECRET_LOCKED_DESCRIPTION",
      videoUrl:"https://private.example.com/secret.mp4",
      imageUrls:["https://private.example.com/secret.png"],
    })]),day);
    expect(result.steps[0]).toMatchObject({
      locked:true,description:"",videoUrl:null,imageUrls:[],
    });
    expect(JSON.stringify(result)).not.toContain("SECRET_LOCKED_DESCRIPTION");
  });
  it("D05b locked Core monetization target exposes only exact physical StepOnDay ID",()=>{
    const target="c"+"t".repeat(24);
    const projection=projectTrainingDay(raw([step({
      locked:true, description:"PRIVATE_LOCKED_DESCRIPTION",
      checklist:[{id:"SECRET_EXAM_QUESTION"}],
      monetizationTarget:{targetType:"COURSE_STEP",targetId:target},
    })]),day);
    expect(projection.steps[0].unlockTargetId).toBe(target);
    expect(projection.steps[0].description).toBe("");
    expect(JSON.stringify(projection)).not.toMatch(/PRIVATE_|SECRET_/);
    expect(projectTrainingDay(raw([step({locked:true,
      monetizationTarget:{targetType:"COURSE_STEP",targetId:"../tamper"},
    })]),day).steps[0].unlockTargetId).toBeUndefined();
  });
  it("D05c only authorized HTTPS/relative PDF media, none for locked steps",()=>{
    const open=projectTrainingDay(raw([step({pdfUrls:[
      "https://cdn.example.com/instructions.pdf",
      "/api/v1/training/documents/allowed.pdf",
      "javascript:alert(1)","http://evil.test/hidden.pdf",
    ]})]),day);
    expect(open.steps[0].pdfUrls).toEqual([
      "https://cdn.example.com/instructions.pdf",
      "/api/v1/training/documents/allowed.pdf",
    ]);
    expect(projectTrainingDay(raw([step({locked:true,
      pdfUrls:["https://cdn.example.com/secret.pdf"],
    })]),day).steps[0].pdfUrls).toBeUndefined();
  });
  it("D06 media scheme whitelist rejects javascript/data/http/credentials",()=>{
    for(const value of [
      "javascript:alert(1)","data:video/mp4;base64,x","blob:abc",
      "http://example.com/clip.mp4","//evil.com/steal",
      "https://user:secret@example.com/x",
      "/\\evil.com","/api/secret\nX-Host:evil",
    ])expect(safeStepMediaUrl(value)).toBeNull();
    expect(safeStepMediaUrl("https://cdn.example.com/clip.mp4"))
      .toBe("https://cdn.example.com/clip.mp4");
    expect(safeStepMediaUrl("/api/v1/training/videos/abc")).toBe(
      "/api/v1/training/videos/abc");
  });
  it("D07 blocks unsafe media while retaining authorized text",()=>{
    const result=projectTrainingDay(raw([step({
      videoUrl:"javascript:alert(1)",
      imageUrls:["data:image/svg+xml,evil","https://img.example.com/x.png"],
    })]),day);
    expect(result.steps[0].videoUrl).toBeNull();
    expect(result.steps[0].imageUrls).toEqual(["https://img.example.com/x.png"]);
  });
  it("D08 invalid course slug throws before network",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(getTrainingDay("../secret",day)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

/** Frozen AG1/AG3 SOURCE-only HTTP wire, not a verified positional mapping. */
describe("AG2-COURSE011 LEARN032 source contract, no live Web POST",()=>{
  const ids={courseId:"clxcourse0000000000000001",
    dayOnCourseId:"clwdayoc0000000000000001",stepIndex:1};
  it("W01 exact Native-compatible five POST envelopes with cookie transport",async()=>{
    const fetch=vi.fn().mockImplementation(async()=>new Response(
      JSON.stringify({success:true}),
      {status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetch);
    const commands:TrainingOnlineStepCommand[]=[
      {action:"start",ids,durationSec:120},
      {action:"pause",ids,timeLeftSec:57},
      {action:"resume",ids},
      {action:"complete/practice",ids},
      {action:"complete/theory",ids},
    ];
    for(const command of commands)await postTrainingOnlineStep(command);
    expect(fetch).toHaveBeenCalledTimes(5);
    const paths=["start","pause","resume","complete/practice","complete/theory"];
    const bodies=[
      {...ids,durationSec:120,status:"IN_PROGRESS"},
      {...ids,timeLeftSec:57},ids,ids,ids,
    ];
    for(let i=0;i<5;i++){
      const [url,options]=fetch.mock.calls[i]!;
      expect(url).toBe("/api/v1/training/step/"+paths[i]);
      expect(options).toMatchObject({method:"POST",credentials:"include",
        cache:"no-store"});
      expect(options.headers["X-Gafus-Auth-Transport"]).toBe("cookie");
      expect(JSON.parse(options.body)).toEqual(bodies[i]);
      expect(JSON.stringify(options)).not.toMatch(/Idempotency-Key|Authorization|platform/);
    }
  });
  it("W02 invalid IDs/negative or fractional timer/index fail before fetch",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    for(const command of [
      {action:"start",ids:{...ids,stepIndex:-1},durationSec:10},
      {action:"start",ids,durationSec:-1},
      {action:"pause",ids,timeLeftSec:1.25},
      {action:"resume",ids:{...ids,courseId:"../other"}},
    ] as TrainingOnlineStepCommand[]){
      await expect(postTrainingOnlineStep(command)).rejects.toThrow("INVALID_ONLINE_PROGRESS_WIRE");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("W03 malformed/uncertain 200, 409, and 500 do not turn into success",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    fetch.mockResolvedValueOnce(new Response("not-json",{status:200}));
    await expect(postTrainingOnlineStep({action:"resume",ids})).rejects.toThrow();
    for(const status of [409,500]){
      fetch.mockResolvedValueOnce(new Response(JSON.stringify({
        success:false,code:status===409?"INVALID_STATE":undefined,
        error:"PRIVATE_SERVER_DETAILS",
      }),{status}));
      await expect(postTrainingOnlineStep({action:"resume",ids})).rejects.toMatchObject({status});
    }
    expect(fetch).toHaveBeenCalledTimes(3); // no implicit retry
  });
});
