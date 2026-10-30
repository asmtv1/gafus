/** AG1/G1 native offline wire: real Hono routes/methods/Zod/auth middleware,
 * injected Core/Prisma/mailer/JWT. DO NOT claim SQL or old native-device ACK. */
import {Hono} from "hono";
import {beforeEach,describe,it,expect,vi} from "vitest";
import {writeFileSync,mkdirSync} from "node:fs";
import {join} from "node:path";
const m=vi.hoisted(()=>({
 jwt:vi.fn(),reg:vi.fn(),step:vi.fn(),access:vi.fn(),sync:vi.fn(),theory:vi.fn(),daily:vi.fn(),prevention:vi.fn(),
 vid:vi.fn(),vidAccess:vi.fn(),saveVideo:vi.fn(),notifications:vi.fn(),
}));
vi.mock("@gafus/auth/jwt",()=>({verifyAccessToken:m.jwt}));
vi.mock("@gafus/core/services/auth",()=>({isRegistrationCompleted:m.reg}));
vi.mock("@gafus/core/services/training",()=>({
 getTrainingDays:vi.fn(),getTrainingDayWithMonetizedSteps:vi.fn(),requireCourseStepOperationAccess:m.access,
 syncUserCourseStatusFromDays:m.sync,updateStepAndDay:m.step,validateTheoryStepForCompletion:m.theory,
}));
vi.mock("@gafus/core/services/dailyCourse",()=>({getDailyCourseDayWithUserSteps:vi.fn(),getTodayDailyCourse:vi.fn(),updateDailyCourseStepAndDay:m.daily}));
vi.mock("@gafus/core/services/petPrevention",async()=>{
 const schema=await import("../../../../../packages/core/src/services/petPrevention/schemas");
 return {...schema,upsertPreventionEntriesBatch:m.prevention,createEntry:vi.fn(),updateEntry:vi.fn(),deleteEntry:vi.fn(),getEntriesByPet:vi.fn()};
});
vi.mock("@gafus/core/services/diary",()=>({getDiaryEntries:vi.fn(),saveDiaryEntry:vi.fn()}));
vi.mock("@gafus/core/services/course",()=>({checkCourseAccess:vi.fn()}));
vi.mock("@gafus/core/services/rewardedCredits",()=>({SubscriptionOrCreditsRequiredError:class extends Error{},requirePremiumOrRewardedAccessForVideoUrl:vi.fn()}));
vi.mock("@gafus/core/services/video",()=>({getProgress:vi.fn(),checkVideoAccess:m.vidAccess,getVideoManifestInfo:m.vid,saveProgress:m.saveVideo}));
vi.mock("@gafus/core/services/notifications",()=>({createStepNotificationForStepStart:m.notifications,getDayFromDayOnCourseId:vi.fn(),pauseStepNotification:vi.fn(),resetStepNotification:vi.fn(),resumeStepNotification:vi.fn()}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({error:vi.fn(),warn:vi.fn(),info:vi.fn()})}));
vi.mock("@gafus/cdn-upload",()=>({downloadFileFromCDN:vi.fn(),extractVideoIdFromCdnUrl:vi.fn(),getSignedDownloadUrl:vi.fn(),streamFileFromCDN:vi.fn()}));
vi.mock("@gafus/video-access",()=>({VIDEO_PLAYBACK_TOKEN_TTL_MINUTES:720,getVideoAccessService:vi.fn()}));
import {authMiddleware} from "../../middleware/auth";
import {trainingRoutes} from "./training";
import {dailyCourseRoutes} from "./daily-course";
import {petPreventionRoutes} from "./pet-prevention";
const out="/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g1-ag3-offline-wire-ag1-20261017/captures";
const enabled=process.env.G1_AG3_WIRE_CAPTURE_DIR===out;
const COURSE="clwcourse00000000000000001",DAY="clwdayoc0000000000000001",PET="test-pet-A",KEY="704f7a3b-6cfa-4de4-a901-03d7fb44d033";
function app(){const a=new Hono();for(const path of ["training","daily-course","pets"]){a.use(`/api/v1/${path}/*`,authMiddleware);}a.route("/api/v1/training",trainingRoutes);a.route("/api/v1/daily-course",dailyCourseRoutes);a.route("/api/v1/pets",petPreventionRoutes);return a;}
type Req={path:string;body?:unknown;method?:string;actor?:"A"|"B"|"guest"|"stale"|"pending"|"badOrigin";headers?:Record<string,string>};
async function request(input:Req){
 const method=input.method??"POST",headers:Record<string,string>={...input.headers};
 const actor=input.actor??"A";
 if(actor==="badOrigin"){headers.cookie="gafus_access=synthetic-A";headers.origin="https://evil.invalid";}
 else if(actor!=="guest")headers.authorization=`Bearer ${actor==="stale"?"synthetic-stale":actor==="pending"?"synthetic-pending":`synthetic-${actor}`}`;
 if(input.body!==undefined)headers["content-type"]="application/json";
 const res=await app().request(`http://localhost${input.path}`,{method,headers,...(input.body===undefined?{}:{body:JSON.stringify(input.body)})});
 const txt=await res.text();let json:unknown;try{json=JSON.parse(txt)}catch{json=undefined}
 return {method,path:input.path,actor,bodyKeys:input.body&&typeof input.body==="object"?Object.keys(input.body):[],status:res.status,cacheControl:res.headers.get("cache-control"),retryAfter:res.headers.get("retry-after"),body:json};
}
async function capture(id:string,actual:Awaited<ReturnType<typeof request>>[],notes:string[]=[]){mkdirSync(out,{recursive:true});writeFileSync(join(out,id+".json"),JSON.stringify({id,provenance:"ACTUAL_HONO_VALIDATION_AUTH__INJECTED_CORE_NO_SQL",rateLimiter:"NOT_MOUNTED",observations:actual,notes},null,2)+"\n",{flag:"wx"});}
const S={courseId:COURSE,dayOnCourseId:DAY,stepIndex:0};
const P={clientId:KEY,type:"VACCINATION",performedAt:"2026-10-16T12:00:00.000Z",reminderEnabled:false};
function preset(){vi.clearAllMocks();m.jwt.mockImplementation(async(t:string)=>t==="synthetic-A"||t==="synthetic-B"||t==="synthetic-pending"?{id:t.split("-").at(-1),username:"fixture",role:"USER"}:null);m.reg.mockImplementation(async(id:string)=>id!=="pending");m.step.mockResolvedValue({courseId:COURSE,allCompleted:false,stepJustCompleted:true});m.daily.mockResolvedValue(undefined);m.sync.mockResolvedValue(undefined);m.theory.mockResolvedValue({valid:true});m.access.mockResolvedValue(undefined);m.notifications.mockResolvedValue(undefined);m.prevention.mockResolvedValue({success:true,data:{created:1,updated:0,errors:[]}});m.vid.mockResolvedValue({id:"video1",transcodingStatus:"COMPLETED"});m.vidAccess.mockResolvedValue(true);m.saveVideo.mockResolvedValue({success:true});}
(enabled?describe:describe.skip)("AG3 native progress/prevention existing Hono method ACK",()=>{
 beforeEach(preset);
 const mutations:[string,string,unknown][]=[
  ["PX01","/api/v1/training/step/start",{...S,durationSec:60}],
  ["PX02","/api/v1/training/step/pause",{...S,timeLeftSec:45}],
  ["PX03","/api/v1/training/step/resume",S],
  ["PX04","/api/v1/training/step/reset",S],
  ["PX05","/api/v1/training/step/complete/practice",S],
  ["PX06","/api/v1/training/step/complete/theory",S],
  ["PX07","/api/v1/daily-course/step/start",{scheduleId:"schedule1",stepIndex:0,durationSec:60}],
  ["PX08","/api/v1/daily-course/step/pause",{scheduleId:"schedule1",stepIndex:0,timeLeftSec:50}],
  ["PX09","/api/v1/daily-course/step/resume",{scheduleId:"schedule1",stepIndex:0}],
  ["PX10","/api/v1/daily-course/step/reset",{scheduleId:"schedule1",stepIndex:0}],
  ["PX11","/api/v1/daily-course/step/complete",{scheduleId:"schedule1",stepIndex:0}],
  ["PX12","/api/v1/training/video/video1/progress",{positionSec:42}],
 ];
 for(const [id,path,body] of mutations){it(`${id} actual ${path} success ACK does not mention offline queueId`,async()=>{
  const r=await request({path,body});expect(r.status).toBe(200);expect(r.body).toMatchObject({success:true});expect(JSON.stringify(r.body)).not.toContain("queueId");await capture(id,[r],["Core injected, only HTTP ACK; no event-id dedup key accepted by validation"]);
 });}
 it("PX13 replay of identical step start is dispatched again; duplicate safe outcome unproven",async()=>{
  const a=await request({path:"/api/v1/training/step/start",body:{...S,durationSec:50,queueId:"LEGACY_EVENT"}});const b=await request({path:"/api/v1/training/step/start",body:{...S,durationSec:50,queueId:"LEGACY_EVENT"}});
  expect([a.status,b.status]).toEqual([200,200]);expect(m.step).toHaveBeenCalledTimes(2);await capture("PX13",[a,b],["Exact same event causes TWO Core dispatches; z.object strips unsolicited queueId; NOT exactly-once"]);
 });
 it("PX14 progress INVALID_STATE409 isn't ACK",async()=>{
  m.step.mockRejectedValueOnce(Error("INVALID_STATE: status already changed"));const r=await request({path:"/api/v1/training/step/pause",body:{...S,timeLeftSec:30}});expect(r.status).toBe(409);expect(r.body).toMatchObject({success:false,code:"INVALID_STATE"});await capture("PX14",[r]);
 });
 it("PX15 course entitlement forbidden 403 before mutation",async()=>{
  m.access.mockRejectedValueOnce(Error("COURSE_ACCESS_DENIED"));const r=await request({path:"/api/v1/training/step/start",body:{...S,durationSec:30}});expect(r.status).toBe(403);expect(m.step).not.toHaveBeenCalled();await capture("PX15",[r]);
 });
 it("PX16 guest, expired epoch, pending and bad Origin are not ACK",async()=>{
  const obs=[];for(const actor of ["guest","stale","pending","badOrigin"] as const){obs.push(await request({path:"/api/v1/training/step/start",body:{...S,durationSec:30},actor}));}
  expect(obs.map(x=>x.status)).toEqual([401,401,401,403]);expect(m.step).not.toHaveBeenCalled();await capture("PX16",obs,["JWT verifyAccessToken and registration statuses simulated; real session DB epoch not executed"]);
 });
 it("PX17 malformed training status schema 400 no mutation",async()=>{
  const r=await request({path:"/api/v1/training/step/start",body:{...S,stepIndex:-3,durationSec:1}});expect(r.status).toBe(400);expect(m.step).not.toHaveBeenCalled();await capture("PX17",[r]);
 });
 it("PX18 unexpected Core failure 500 no durable ACK",async()=>{
  m.step.mockRejectedValueOnce(Error("SIMULATED_DB_UNAVAILABLE"));const r=await request({path:"/api/v1/training/step/start",body:{...S,durationSec:30}});expect(r.status).toBe(500);await capture("PX18",[r]);
 });
 it("PR01 valid prevention batch aggregate success, forwards owner",async()=>{
  const r=await request({path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries:[P]}});expect(r.status).toBe(200);expect(r.body).toMatchObject({success:true,data:{created:1,updated:0,errors:[]}});expect(m.prevention).toHaveBeenCalledWith("A",PET,expect.arrayContaining([expect.objectContaining({clientId:KEY})]));await capture("PR01",[r]);
 });
 it("PR02 repeated same clientId reaches Core TWICE (SQL dedup separate)",async()=>{
  const x={path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries:[P]}};const a=await request(x),b=await request(x);expect([a.status,b.status]).toEqual([200,200]);expect(m.prevention).toHaveBeenCalledTimes(2);await capture("PR02",[a,b],["Hono has no dedup; actual SQL unique petId/clientId must be proven separately"]);
 });
 it("PR03 partial errors in success=true are not individually ACKed",async()=>{
  m.prevention.mockResolvedValueOnce({success:true,data:{created:1,updated:0,errors:["one failed"]}});const r=await request({path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries:[P]}});expect(r.status).toBe(200);expect(r.body).toMatchObject({success:true,data:{errors:["one failed"]}});await capture("PR03",[r],["Hono transmits aggregate errors; no per-clientId success/failure evidence"]);
 });
 it("PR04 failed owner check is HTTP404 and no item ACK",async()=>{
  m.prevention.mockResolvedValueOnce({success:false,error:"Питомец не найден"});const r=await request({path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries:[P]},actor:"B"});expect(r.status).toBe(404);await capture("PR04",[r]);
 });
 it("PR05 invalid UUID/empty/>50 batch rejects before Core",async()=>{
  const obs=[];for(const entries of [[{...P,clientId:"not-uuid"}],[],Array.from({length:51},()=>P)]){obs.push(await request({path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries}}));}expect(obs.every(x=>x.status===400)).toBe(true);expect(m.prevention).not.toHaveBeenCalled();await capture("PR05",obs);
 });
 it("PR06 prevention 401/403 for guest, stale, pending, wrong cookie Origin",async()=>{
  const obs=[];for(const actor of ["guest","stale","pending","badOrigin"] as const)obs.push(await request({path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries:[P]},actor}));expect(obs.map(x=>x.status)).toEqual([401,401,401,403]);expect(m.prevention).not.toHaveBeenCalled();await capture("PR06",obs);
 });
 it("PR07 Core fails HTTP500 no ACK",async()=>{
  m.prevention.mockRejectedValueOnce(Error("SYNTHETIC_DB_FAILURE"));const r=await request({path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries:[P]}});expect(r.status).toBe(500);await capture("PR07",[r]);
 });
 it("PR08 empty business result HTTP404 (current mapping, NOT 409)",async()=>{
  m.prevention.mockResolvedValueOnce({success:false,error:"Неверные данные"});const r=await request({path:`/api/v1/pets/${PET}/prevention/batch`,body:{entries:[P]}});expect(r.status).toBe(404);await capture("PR08",[r]);
 });
});
