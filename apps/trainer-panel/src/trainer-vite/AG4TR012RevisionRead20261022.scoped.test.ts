// @vitest-environment node
/** AG4 option A read-revision design-only: MOCK fetch, NO HTTP mutation. */
import {readFileSync} from "node:fs";
import {beforeEach,expect,it,vi} from "vitest";
import {
 observeNameRevision,parseRevision,previewNameChange,REVISION_HEADER,
 timestampCollision,type Session,
} from "./AG4TR012RevisionRead20261022";
const makeSession=(id="trainer_A",epoch="epoch_A",handle:object={})=>({
 actor:{id,role:"TRAINER" as const},authEpoch:epoch,token:`jwt_${id}`,
 actorHandle:handle,
});
const draft=(id="course_A")=>({id,name:"Исходное название",
 guideContent:null,shortDesc:"",description:"",duration:"1 день",
 videoUrl:null,logoImg:"",isPrivate:true,isPaid:false,
 showInProfile:true,isPersonalized:false,equipment:"",trainingLevel:"BEGINNER",
 dayLinks:[{id:"link_A",dayId:"day_A",order:1,day:{id:"day_A",title:"День 1"}}],
 access:[{userId:"student_A",user:{id:"student_A",username:"reader_A"}}],
});
const timestamp="2026-10-21T10:02:03.000Z";
const headers=(options:{revision?:string;cache?:string;referrer?:string}={})=>({
 "cache-control":options.cache??"private, no-store",
 "referrer-policy":options.referrer??"no-referrer",
 ...(options.revision===undefined?{}:{[REVISION_HEADER]:options.revision}),
});
const makeResponse=(options:{revision?:string;status?:number;cache?:string;
 referrer?:string;body?:unknown}={})=>new Response(JSON.stringify(options.body??{
 success:true,data:draft(),
}),{status:options.status??200,headers:headers(options)});
const init=(fetchImpl:typeof fetch,who:Session=makeSession())=>({
 courseId:"course_A",session:who,getCurrentSession:()=>who,
 signal:new AbortController().signal,fetchImpl,
});
beforeEach(()=>vi.clearAllMocks());

it("actual registered Hono has narrow name CAS PATCH, not whole-form unsafe write",()=>{
 const route=readFileSync("../api/src/routes/v1/trainer-courses.ts","utf8");
 expect(route).toContain('trainerCoursesRoutes.get("/:courseId/draft"');
 expect(route).not.toContain(REVISION_HEADER);
 expect(route).toContain('trainerCoursesRoutes.patch("/:courseId/name"');
 expect(route).not.toMatch(/trainerCoursesRoutes\.(put|post|delete)\(/);
});
it("without proposed header current GET 200 cannot authorize a name edit",async()=>{
 const f=vi.fn(async()=>makeResponse()) as typeof fetch;
 await expect(observeNameRevision(init(f))).rejects.toThrow("REVISION_UNAVAILABLE");
 expect(f).toHaveBeenCalledTimes(1);
});
it("future header 200 observation uses EXISTING strict DTO, owner token, private GET",async()=>{
 const f=vi.fn(async()=>makeResponse({revision:timestamp})) as typeof fetch;
 const who=makeSession();const observed=await observeNameRevision(init(f,who));
 expect(observed).toMatchObject({draft:{id:"course_A",name:"Исходное название"},
  actorId:"trainer_A",authEpoch:"epoch_A",updatedAt:timestamp,
  readyForWrite:false,collisionSafe:false});
 expect(f).toHaveBeenCalledWith("/api/v1/trainer/courses/course_A/draft",
  expect.objectContaining({method:"GET",cache:"no-store",
   referrerPolicy:"no-referrer",headers:{Authorization:"Bearer jwt_trainer_A"}}));
 const inert=previewNameChange(observed,"Исправленное название",who,()=>who);
 expect(inert).toEqual({payload:{courseId:"course_A",
  name:"Исправленное название",observedUpdatedAt:timestamp},readyForWrite:false});
 expect(f).toHaveBeenCalledTimes(1);
});
it("strict DTO remains unchanged; header never becomes JSON field",async()=>{
 const f=vi.fn(async()=>makeResponse({revision:timestamp})) as typeof fetch;
 const got=await observeNameRevision(init(f));
 expect(Object.keys(got.draft).sort()).toEqual(Object.keys(draft()).sort());
 expect(got.draft).not.toHaveProperty("updatedAt");
 expect(got.draft).not.toHaveProperty("revision");
});
it("invalid revision formats/timestamps cannot make the GET write-capable",async()=>{
 for(const revision of ["", "yesterday", "2026-25-90T10:02:03.000Z",
  "2026-10-21T10:02:03Z", "2026-10-21T10:02:03.000+00:00"]){
  const f=vi.fn(async()=>makeResponse({revision})) as typeof fetch;
  await expect(observeNameRevision(init(f))).rejects.toThrow("REVISION_UNAVAILABLE");
 }
 expect(parseRevision(timestamp)).toBe(timestamp);
});
it("public cache directive with private/no-store must be rejected BEFORE revision",async()=>{
 const f=vi.fn(async()=>makeResponse({revision:timestamp,
  cache:"public, private, no-store"})) as typeof fetch;
 await expect(observeNameRevision(init(f))).rejects.toThrow("UNSAFE_PRIVATE_RESPONSE");
});
it("wrong referrer-policy rejects header; bearer missing or guest causes zero GET",async()=>{
 const f=vi.fn(async()=>makeResponse({revision:timestamp,
  referrer:"unsafe-url"})) as typeof fetch;
 await expect(observeNameRevision(init(f))).rejects.toThrow("UNSAFE_PRIVATE_RESPONSE");
 const guest={...makeSession(),actor:{id:"guest_1",role:"USER" as const}};
 await expect(observeNameRevision(init(f,guest))).rejects.toThrow("SESSION_RETIRED");
 const missing={...makeSession(),token:""};
 await expect(observeNameRevision(init(f,missing))).rejects.toThrow("SESSION_RETIRED");
 expect(f).toHaveBeenCalledTimes(1);
});
it("early 401/429/404 block revision, do not treat error as an empty draft",async()=>{
 for(const status of [401,429,404]){
  const f=vi.fn(async()=>makeResponse({revision:timestamp,status})) as typeof fetch;
  await expect(observeNameRevision(init(f))).rejects.toThrow(`HTTP_${status}`);
 }
});
it("malformed/private DTO with plausible revision never accepted",async()=>{
 const wrong={...draft(),access:[{userId:"student_B",user:{id:"student_A",username:"bad"}}]};
 const f=vi.fn(async()=>makeResponse({revision:timestamp,
  body:{success:true,data:wrong}})) as typeof fetch;
 await expect(observeNameRevision(init(f))).rejects.toThrow("INVALID_USER_REFERENCE");
});
it("new principal A→B→A refuses delayed old A GET even when id and epoch reused",async()=>{
 const first=makeSession("trainer_A","epoch_A",{n:1});
 let current:Session|null=first;
 let release!:(value:Response)=>void;
 let started!:(value:void)=>void;
 const entered=new Promise<void>(r=>{started=r;});
 const f=vi.fn(async()=>{started();return new Promise<Response>(r=>{release=r;});}) as typeof fetch;
 const pending=observeNameRevision({courseId:"course_A",session:first,
  getCurrentSession:()=>current,signal:new AbortController().signal,fetchImpl:f});
 await entered;
 current=makeSession("trainer_B","epoch_B",{n:2});
 current=makeSession("trainer_A","epoch_A",{n:3});
 release(makeResponse({revision:timestamp}));
 await expect(pending).rejects.toThrow("SESSION_RETIRED");
});
it("abort on unmount prevents late response publication",async()=>{
 const controller=new AbortController();const first=makeSession();
 let release!:(value:Response)=>void;let started!:(value:void)=>void;
 const entered=new Promise<void>(r=>{started=r;});
 const f=vi.fn(async()=>{started();return new Promise<Response>(r=>{release=r;});}) as typeof fetch;
 const pending=observeNameRevision({courseId:"course_A",session:first,
  getCurrentSession:()=>first,signal:controller.signal,fetchImpl:f});
 await entered;controller.abort();release(makeResponse({revision:timestamp}));
 await expect(pending).rejects.toThrow("SESSION_RETIRED");
});
it("inert preview rejects principal switch and invalid name without any request",async()=>{
 const who=makeSession();const f=vi.fn(async()=>makeResponse({revision:timestamp})) as typeof fetch;
 const observed=await observeNameRevision(init(f,who));
 expect(()=>previewNameChange(observed,"",who,()=>who)).toThrow();
 expect(()=>previewNameChange(observed,"ok",who,()=>makeSession())).toThrow("SESSION_RETIRED");
 expect(f).toHaveBeenCalledTimes(1);
});
it("timestamp collision: two distinct writes at same tick both match same stale CAS",()=>{
 const collision=timestampCollision(timestamp,timestamp);
 expect(collision).toEqual({staleSecondCasMayMatch:true,
  safeForConcurrency:false,readyFor409:false});
 expect(timestampCollision(timestamp,"2026-10-21T10:02:03.001Z")
  .staleSecondCasMayMatch).toBe(false);
});
