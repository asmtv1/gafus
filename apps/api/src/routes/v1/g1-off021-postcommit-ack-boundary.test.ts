/** OFF-021 AG1 actual Hono POST handler after-commit ACK boundary.
 * Real routes/Zod, injected Core/JWT-side principal; no DB/JWT signature or native replay.
 * Does NOT exercise the proposed v2 protocol. No production side effects.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const m=vi.hoisted(()=>({mutate:vi.fn(),sync:vi.fn(),theory:vi.fn(),access:vi.fn(),notify:vi.fn(),getDay:vi.fn(),resetNotify:vi.fn()}));
vi.mock("@gafus/core/services/training",()=>({
 getTrainingDays:vi.fn(),getTrainingDayWithMonetizedSteps:vi.fn(),requireCourseStepOperationAccess:m.access,
 syncUserCourseStatusFromDays:m.sync,updateStepAndDay:m.mutate,validateTheoryStepForCompletion:m.theory,
}));
vi.mock("@gafus/core/services/dailyCourse",()=>({getDailyCourseDayWithUserSteps:vi.fn(),getTodayDailyCourse:vi.fn(),updateDailyCourseStepAndDay:vi.fn()}));
vi.mock("@gafus/core/services/diary",()=>({getDiaryEntries:vi.fn(),saveDiaryEntry:vi.fn()}));
vi.mock("@gafus/core/services/course",()=>({checkCourseAccess:vi.fn()}));
vi.mock("@gafus/core/services/rewardedCredits",()=>({SubscriptionOrCreditsRequiredError:class extends Error{},requirePremiumOrRewardedAccessForVideoUrl:vi.fn()}));
vi.mock("@gafus/core/services/video",()=>({getProgress:vi.fn(),checkVideoAccess:vi.fn(),getVideoManifestInfo:vi.fn(),saveProgress:vi.fn()}));
vi.mock("@gafus/core/services/notifications",()=>({createStepNotificationForStepStart:m.notify,getDayFromDayOnCourseId:m.getDay,pauseStepNotification:vi.fn(),resetStepNotification:m.resetNotify,resumeStepNotification:vi.fn()}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({error:vi.fn(),warn:vi.fn(),info:vi.fn()})}));
vi.mock("@gafus/cdn-upload",()=>({downloadFileFromCDN:vi.fn(),extractVideoIdFromCdnUrl:vi.fn(),getSignedDownloadUrl:vi.fn(),streamFileFromCDN:vi.fn()}));
vi.mock("@gafus/video-access",()=>({VIDEO_PLAYBACK_TOKEN_TTL_MINUTES:720,getVideoAccessService:vi.fn()}));
import { trainingRoutes } from "./training";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const CAP=ROOT+"/apps/api/.g1-off021-journal-gap-ag1-20261017/captures";
const captureEnabled=process.env.AG1_OFF021_ACK_GAP_CAPTURE_DIR===CAP && process.env.TMPDIR?.startsWith(ROOT+"/apps/api/.g1-off021-journal-gap-ag1-20261017/tmp/");
const COURSE="clwcourse00000000000000001";
const DAY="clwdayoc0000000000000001";
const body={courseId:COURSE,dayOnCourseId:DAY,stepIndex:0};
const makeApp=()=>{const app=new Hono();app.use("/api/v1/training/*",async(c,next)=>{c.set("user",{id:"synthetic-owner-A",username:"synthetic",role:"USER"});await next();});app.route("/api/v1/training",trainingRoutes);return app;};
type Observation={id:string;request:{method:"POST";path:string;fieldNames:string[];idempotencyHeaderPresent:boolean};response:{status:number;body:unknown;hasDurableAck:boolean;cacheControl:string|null};calls:{mutation:number;sync:number;notify:number}};
async function send(id:string,path:string,input:unknown=body,key?:string):Promise<Observation>{
 const hdr:Record<string,string>={"content-type":"application/json"};if(key)hdr["Idempotency-Key"]=key;
 const res=await makeApp().request("http://synthetic.local/api/v1/training"+path,{method:"POST",headers:hdr,body:JSON.stringify(input)});
 const parsed=await res.json();
 return {id,request:{method:"POST",path:"/api/v1/training"+path,fieldNames:Object.keys(input as object),idempotencyHeaderPresent:Boolean(key)},
  response:{status:res.status,body:parsed,hasDurableAck:typeof parsed==="object"&&parsed!==null&&"ack" in parsed,cacheControl:res.headers.get("cache-control")},
  calls:{mutation:m.mutate.mock.calls.length,sync:m.sync.mock.calls.length,notify:m.notify.mock.calls.length}};
}
function archive(id:string,rows:Observation[],note:string){if(!captureEnabled)return;mkdirSync(CAP,{recursive:true});writeFileSync(join(CAP,id+".json"),JSON.stringify({id,provenance:"REAL_HONO_ROUTES_ZOD__MOCKED_CORE_AND_AUTH__NO_PG_NO_NATIVE",actualSQL:false,existingV2Protocol:false,note,observations:rows},null,2)+"\n",{flag:"wx"});}
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({courseId:COURSE,courseType:"synthetic"});m.mutate.mockResolvedValue({courseId:COURSE,allCompleted:true,stepJustCompleted:true});m.sync.mockResolvedValue(undefined);m.theory.mockResolvedValue({valid:true});m.notify.mockResolvedValue(undefined);m.getDay.mockResolvedValue("synthetic-day");m.resetNotify.mockResolvedValue(undefined);});
describe("OFF021 after-commit HTTP receipt gap: existing server only",()=>{
 it("PC01 practice Core resolves, course sync throws, server still returns 200 without event ACK",async()=>{
  m.sync.mockRejectedValueOnce(Error("SYNTHETIC_AFTER_COMMIT_COURSE_SYNC_FAILURE"));
  const r=await send("PC01","/step/complete/practice");
  expect(r.response.status).toBe(200);expect(r.response.body).toEqual({success:true});expect(r.response.hasDurableAck).toBe(false);
  expect(r.calls).toMatchObject({mutation:1,sync:1});archive("PC01",[r],"After Core promise (actual PG commit NOT tested here), failing course sync swallowed and 200");
 });
 it("PC02 theory Core resolves, course sync throws, returns 500 after completed Core promise",async()=>{
  m.sync.mockRejectedValueOnce(Error("SYNTHETIC_AFTER_COMMIT_COURSE_SYNC_FAILURE"));
  const r=await send("PC02","/step/complete/theory");
  expect(r.response.status).toBe(500);expect(r.response.body).toEqual({success:false,error:"Внутренняя ошибка сервера"});expect(r.response.hasDurableAck).toBe(false);
  expect(r.calls).toMatchObject({mutation:1,sync:1});archive("PC02",[r],"500 after Core resolved, therefore 500 != proof no step commit");
 });
 it("PC03 theory same request after after-Core 500 dispatches Core again, no stable replay receipt",async()=>{
  m.sync.mockRejectedValueOnce(Error("SYNTHETIC_AFTER_COMMIT_COURSE_SYNC_FAILURE"));
  const a=await send("PC03a","/step/complete/theory");
  const b=await send("PC03b","/step/complete/theory");
  expect([a.response.status,b.response.status]).toEqual([500,200]);expect(m.mutate).toHaveBeenCalledTimes(2);
  expect(a.response.hasDurableAck).toBe(false);expect(b.response.hasDurableAck).toBe(false);archive("PC03",[a,b],"Same logical retry reruns Core, not exactly-once");
 });
 it("PC04 unsolicited Idempotency-Key same POST twice does not dedupe practice",async()=>{
  const key="514acd7f-3e91-42d1-8409-05dd8cc82911";
  const a=await send("PC04a","/step/complete/practice",body,key);const b=await send("PC04b","/step/complete/practice",body,key);
  expect([a.response.status,b.response.status]).toEqual([200,200]);expect(m.mutate).toHaveBeenCalledTimes(2);
  expect(a.response.hasDurableAck).toBe(false);expect(b.response.hasDurableAck).toBe(false);archive("PC04",[a,b],"Current server ignores proposed Idempotency-Key; cannot call it implemented");
 });
 it("PC05 unsolicited queueId stripped by Zod before Core, same event still dispatches twice",async()=>{
  const incoming={...body,queueId:"synthetic-local-queue-1"};
  const a=await send("PC05a","/step/complete/practice",incoming),b=await send("PC05b","/step/complete/practice",incoming);
  expect([a.response.status,b.response.status]).toEqual([200,200]);
  expect(m.mutate).toHaveBeenCalledTimes(2);expect(m.mutate).toHaveBeenCalledWith("synthetic-owner-A",DAY,0,{type:"complete"});
  archive("PC05",[a,b],"No correlation with local queueId");
 });
 it("PC06 legitimate complete→reset→complete dispatches all three; no new semantics imposed",async()=>{
  const a=await send("PC06a","/step/complete/practice");
  const b=await send("PC06b","/step/reset");
  const c=await send("PC06c","/step/complete/practice");
  expect([a.response.status,b.response.status,c.response.status]).toEqual([200,200,200]);
  expect(m.mutate.mock.calls.map(x=>x[3].type)).toEqual(["complete","reset","complete"]);
  expect(m.resetNotify).toHaveBeenCalledTimes(1);archive("PC06",[a,b,c],"Mocked Core calls; real SQL legitimate reset/recomplete was NSQL12 PASS");
 });
 it("PC07 denied course access precedes mutation even when idempotency header supplied",async()=>{
  m.access.mockRejectedValueOnce(Error("COURSE_ACCESS_DENIED"));
  const r=await send("PC07","/step/complete/practice",body,"514acd7f-3e91-42d1-8409-05dd8cc82911");
  expect(r.response.status).toBe(403);expect(m.mutate).not.toHaveBeenCalled();archive("PC07",[r],"Auth/entitlement denial cannot ACK event");
 });
 it("PC08 invalid stepIndex rejects 400 before Core, no ACK",async()=>{
  const r=await send("PC08","/step/complete/practice",{...body,stepIndex:-1});
  expect(r.response.status).toBe(400);expect(m.mutate).not.toHaveBeenCalled();archive("PC08",[r],"Actual Zod 400");
 });
 it("PC09 stale step state 409 has no stored replay proof",async()=>{
  m.mutate.mockRejectedValueOnce(Error("INVALID_STATE: cannot pause completed"));
  const r=await send("PC09","/step/pause",{...body,timeLeftSec:30});
  expect(r.response.status).toBe(409);expect(r.response.hasDurableAck).toBe(false);archive("PC09",[r],"Existing INVALID_STATE is not duplicate-event ACK");
 });
 it("PC10 repeated START schedules two separate notification attempts",async()=>{
  const input={...body,durationSec:60};
  const a=await send("PC10a","/step/start",input);const b=await send("PC10b","/step/start",input);
  expect([a.response.status,b.response.status]).toEqual([200,200]);expect(m.mutate).toHaveBeenCalledTimes(2);expect(m.notify).toHaveBeenCalledTimes(2);
  archive("PC10",[a,b],"Two dispatches/scheduling calls observed, actual external push and queue dedup NOT executed");
 });
 it("PC11 invalid theory subtype denies before progress mutation",async()=>{
  m.theory.mockResolvedValueOnce({valid:false,code:"INVALID_STEP_TYPE",error:"Шаг не является теоретическим"});
  const r=await send("PC11","/step/complete/theory");
  expect(r.response.status).toBe(400);expect(m.mutate).not.toHaveBeenCalled();archive("PC11",[r],"Existing type validator before Core");
 });
 it("PC12 exception directly from progress Core returns 500 and no event receipt",async()=>{
  m.mutate.mockRejectedValueOnce(Error("SYNTHETIC_SQL_WRITE_FAILURE"));
  const r=await send("PC12","/step/complete/practice");
  expect(r.response.status).toBe(500);expect(r.response.body).toEqual({success:false,error:"Внутренняя ошибка сервера"});expect(r.response.hasDurableAck).toBe(false);
  expect(m.sync).not.toHaveBeenCalled();archive("PC12",[r],"Core promise rejected BEFORE any successful Core result; actual SQL rollback separately proven NSQL11");
 });
});
