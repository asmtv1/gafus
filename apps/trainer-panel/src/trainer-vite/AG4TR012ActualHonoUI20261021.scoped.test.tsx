// @vitest-environment node
/** AG4 TR012 NEW cross-boundary: mounted Vite UI->strict client->actual signed Hono.
 * Hono app, auth and limiter middleware, router, JWT are REAL source in-process.
 * Only Core data, Prisma session and RedisStore are mocked; no real SQL/network.
 */
import {randomBytes} from "node:crypto";
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type * as CourseModule from "@gafus/core/services/trainerCourse";
import type {PanelActor} from "./consultationContract";
import type {Root} from "react-dom/client";
import type {act as ReactAct,createElement as ReactCreateElement} from "react";
import {readTrainerCourseDraft} from "./trainerCourseDraftReadContract";

const m=vi.hoisted(()=>({
  course:vi.fn(),session:vi.fn(),registration:vi.fn(),
  rateLimited:false,rateKeys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
 windowMs=60_000;
 init(o:{windowMs:number}){this.windowMs=o.windowMs;}
 async increment(k:string){m.rateKeys.push(k);return {
  totalHits:m.rateLimited?101:1,resetTime:new Date(Date.now()+this.windowMs),
 };}
 async decrement(){return undefined;}
 async resetKey(){return undefined;}
}}));
vi.mock("@gafus/prisma",async(original)=>{
 const mod=await original<typeof PrismaModule>();
 return {...mod,prisma:{...mod.prisma,user:{...mod.prisma.user,
  findUnique:m.session}}};
});
vi.mock("@gafus/core/services/auth",async(original)=>({
 ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/trainerCourse",async(original)=>({
 ...await original<typeof CourseModule>(),getCourseDraftWithRelations:m.course,
}));
const actualAppPath="../../../api/src/app";
const {app}=await vi.importActual<{
 app:{request:(path:string,init?:RequestInit)=>Promise<Response>},
}>(actualAppPath);
const jwtPath="@gafus/auth/jwt";
const {generateAccessToken}=await vi.importActual<{
 generateAccessToken:(input:{id:string;username:string;role:
  "TRAINER"|"ADMIN"|"MODERATOR"})=>Promise<string>,
}>(jwtPath);
const identities={
 A:{id:"trainer_A",username:"trainer_a",role:"TRAINER" as const},
 B:{id:"trainer_B",username:"trainer_b",role:"TRAINER" as const},
 ADMIN:{id:"admin_1",username:"admin",role:"ADMIN" as const},
 MOD:{id:"moderator_1",username:"mod",role:"MODERATOR" as const},
};
const tokens:Record<string,string>={};
const privateCanary="PRIVATE_STUDENT_EMAIL_TOKEN_RECEIPT";
const courseData=(id:string,owner:string)=>({
 id,name:`Course ${id} owner ${owner}`,guideContent:null,shortDesc:"Intro",
 description:"Details",duration:"14 дней",videoUrl:null,logoImg:"",
 isPrivate:true,isPaid:false,showInProfile:true,isPersonalized:false,
 equipment:"",trainingLevel:"BEGINNER",authorId:owner,
 dayLinks:[{id:"link_1",dayId:"day_1",order:1,
  day:{id:"day_1",title:"Первый день",privateNotes:privateCanary},
  studentProgress:{token:privateCanary}}],
 access:[{userId:"learner_1",user:{id:"learner_1",username:"user-a",
  email:privateCanary},secret:privateCanary}],
 reviews:[{message:privateCanary}],userCourses:[{email:privateCanary}],
 payout:privateCanary,
});
const route=(id:string)=>`/main-panel/courses/${id}/edit`;
const apiPrefix="/api/v1/trainer/courses/";
const localFetch:typeof fetch=async(input,init)=>{
 const src=typeof input==="string"?input:input instanceof URL?input.href:input.url;
 const u=new URL(src,"http://localhost");
 const target=u.pathname+u.search;
 if(!target.startsWith(apiPrefix))throw Error("UNEXPECTED_API_DESTINATION");
 if(init?.method!=="GET")throw Error("MUTATION_FORBIDDEN");
 if(init.cache!=="no-store"||init.referrerPolicy!=="no-referrer")
  throw Error("UNSAFE_CLIENT_GET_CONFIG");
 return app.request(target,{method:init.method,headers:init.headers,signal:init.signal});
};
const live=(name:keyof typeof identities,epoch="epoch-1")=>({
 actor:identities[name] as PanelActor,token:tokens[name],authEpoch:epoch,
});

beforeAll(async()=>{
 vi.stubEnv("JWT_SECRET",randomBytes(48).toString("hex"));
 for(const [name,who] of Object.entries(identities)){
  tokens[name]=await generateAccessToken(who);
 }
});
afterAll(()=>vi.unstubAllEnvs());
beforeEach(()=>{
 vi.clearAllMocks();m.rateLimited=false;m.rateKeys.length=0;
 m.registration.mockResolvedValue(true);
 m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(identities).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
 m.course.mockImplementation(async(id:string,actor:string,scope:{allowAdmin:boolean})=>{
  if(id==="missing")return null;
  const owner=id==="course_B"?identities.B.id:identities.A.id;
  if(!scope.allowAdmin&&actor!==owner)return null;
  return courseData(id,owner);
 });
});
const load=async(name:keyof typeof identities,id:string,isCurrent=()=>true)=>{
 const s=live(name);
 return readTrainerCourseDraft({actor:s.actor,courseId:id,token:s.token,
  signal:new AbortController().signal,fetchImpl:localFetch,isCurrent});
};
const assertPrivate=(r:Response)=>{
 const h=(r.headers.get("cache-control")??"").toLowerCase().split(",")
  .map(v=>v.trim());
 expect(h).toContain("private");expect(h).toContain("no-store");
 expect(h).not.toContain("public");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
let dom:{window:Window&typeof globalThis&{close:()=>void}}|null=null;
let root:Root|null=null;
let host:HTMLDivElement|null=null;
let actFn:typeof ReactAct|null=null;
let renderFn:typeof ReactCreateElement|null=null;
async function startDom(){
 const {JSDOM}=await vi.importActual<{
  JSDOM:new(html:string,opts:{url:string})=>{
   window:Window&typeof globalThis&{close:()=>void},
  },
 }>("jsdom");
 dom=new JSDOM("<!doctype html><html><body></body></html>",{
  url:"http://localhost",
 });
 vi.stubGlobal("window",dom.window);
 vi.stubGlobal("document",dom.window.document);
 vi.stubGlobal("navigator",dom.window.navigator);
 vi.stubGlobal("HTMLElement",dom.window.HTMLElement);
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const react=await import("react");
 const client=await import("react-dom/client");
 actFn=react.act;
 renderFn=react.createElement;
 host=dom.window.document.createElement("div");
 dom.window.document.body.append(host);
 root=client.createRoot(host);
}
async function show(name:keyof typeof identities,id:string,opts:{
 enabled?:boolean;epoch?:string;reader?:()=>ReturnType<typeof live>|null;
 token?:string;
}={}){
 if(!root||!actFn||!renderFn)throw Error("DOM_NOT_INITIALIZED");
 const {TrainerOptInRoute}=await import("./optInRoute");
 const s=live(name,opts.epoch);
 await actFn(async()=>root?.render(renderFn!(TrainerOptInRoute,{
  pathname:route(id),actor:s.actor,token:opts.token??s.token,
  authEpoch:s.authEpoch,getCurrentSession:opts.reader??(()=>s),
  fetchImpl:localFetch,enableProposedCourseDraft:opts.enabled??true,
 })));
 return host!;
}
afterEach(async()=>{
 if(root&&actFn)await actFn(async()=>root?.unmount());
 root=null;host?.remove();host=null;dom?.window.close();dom=null;
 vi.unstubAllGlobals();
});

it("default browser-disabled mounted screen makes zero Hono GET; opt-in uses real signed JWT and strict DTO",async()=>{
 await startDom();await show("A","course_A",{enabled:false});
 expect(host?.textContent).toContain("Запросы отключены");
 expect(m.course).not.toHaveBeenCalled();expect(m.rateKeys).toHaveLength(0);
 await show("A","course_A");
 expect(host?.textContent).toContain("Course course_A owner trainer_A");
 expect(host?.textContent).toContain("Первый день");
 expect(host?.textContent).not.toContain(privateCanary);
 expect(host?.textContent).not.toContain("user-a");
 expect(m.course).toHaveBeenCalledExactlyOnceWith("course_A","trainer_A",{allowAdmin:false});
 expect(host?.querySelector("form")).toBeNull();
});
it("actual JWT A→B→A adapter never returns foreign owner's private data",async()=>{
 for(const name of ["A","B","A"] as const){
  const id=name==="A"?"course_A":"course_B";
  const dto=await load(name,id);
  expect(dto.name).toContain(name==="A"?"trainer_A":"trainer_B");
  expect(JSON.stringify(dto)).not.toContain(privateCanary);
 }
 expect(m.course.mock.calls).toEqual([
  ["course_A","trainer_A",{allowAdmin:false}],
  ["course_B","trainer_B",{allowAdmin:false}],
  ["course_A","trainer_A",{allowAdmin:false}],
 ]);
});
it("signed ADMIN can view foreign trainer draft, never forwards userId/allowAdmin query",async()=>{
 await startDom();await show("ADMIN","course_B");
 expect(host?.textContent).toContain("Course course_B owner trainer_B");
 expect(m.course).toHaveBeenCalledExactlyOnceWith("course_B","admin_1",{allowAdmin:true});
 expect(m.rateKeys.length).toBeGreaterThan(0);
});
it("foreign TRAINER and missing course are the same masked 404 on actual app and mounted UI",async()=>{
 for(const id of ["course_B","missing"]){
  const r=await app.request(apiPrefix+id+"/draft",{
   headers:{authorization:"Bearer "+tokens.A},
  });
  expect(r.status).toBe(404);assertPrivate(r);
  expect(await r.json()).toEqual({success:false,code:"NOT_FOUND",error:"Курс не найден"});
 }
 await startDom();await show("A","course_B");
 expect(host?.textContent).toContain("Курс не найден или нет доступа");
 expect(host?.textContent).not.toContain(privateCanary);
});
it("early guest/invalid JWT 401 has normalized UNAUTHORIZED code and private headers, no Core",async()=>{
 for(const authorization of [undefined,"Bearer bad.jwt"]){
  const res=await app.request(apiPrefix+"course_A/draft",{
   headers:authorization?{authorization}:{},
  });
  expect(res.status).toBe(401);assertPrivate(res);
  expect(await res.json()).toMatchObject({success:false,code:"UNAUTHORIZED"});
 }
 expect(m.course).not.toHaveBeenCalled();expect(m.rateKeys).toHaveLength(0);
 await startDom();await show("A","course_A",{token:"bad.jwt",reader:()=>({
  ...live("A"),token:"bad.jwt",
 })});
 expect(host?.textContent).toContain("Не удалось загрузить черновик");
 expect(host?.textContent).not.toContain(privateCanary);
});
it("actual rate limiter 429 normalized RATE_LIMITED and manual mounted GET retry",async()=>{
 m.rateLimited=true;
 const first=await app.request(apiPrefix+"course_A/draft",{
  headers:{authorization:"Bearer "+tokens.A},
 });
 expect(first.status).toBe(429);assertPrivate(first);
 expect(await first.json()).toMatchObject({success:false,code:"RATE_LIMITED"});
 expect(m.course).not.toHaveBeenCalled();
 await startDom();await show("A","course_A");
 expect(host?.textContent).toContain("Не удалось загрузить черновик");
 expect(m.course).not.toHaveBeenCalled();
 m.rateLimited=false;
 const retry=host?.querySelector('button[aria-label="Повторить чтение черновика"]') as HTMLButtonElement;
 expect(retry).not.toBeNull();
 await actFn!(async()=>retry.click());
 expect(host?.textContent).toContain("Course course_A owner trainer_A");
 expect(m.course).toHaveBeenCalledTimes(1);
});
it("registration pending 401 distinct code and MODERATOR signed 403 never read course",async()=>{
 m.registration.mockResolvedValueOnce(false);
 const pending=await app.request(apiPrefix+"course_A/draft",{
  headers:{authorization:"Bearer "+tokens.A},
 });
 expect(pending.status).toBe(401);assertPrivate(pending);
 expect(await pending.json()).toMatchObject({code:"REGISTRATION_PENDING"});
 const denied=await app.request(apiPrefix+"course_A/draft",{
  headers:{authorization:"Bearer "+tokens.MOD},
 });
 expect(denied.status).toBe(403);assertPrivate(denied);
 expect(await denied.json()).toMatchObject({success:false,code:"FORBIDDEN"});
 expect(m.course).not.toHaveBeenCalled();
});
it("actual Hono source projection excludes PII even if synthetic Core returns extra ORM columns",async()=>{
 const dto=await load("A","course_A");
 expect(Object.keys(dto).sort()).toEqual([
  "id","name","guideContent","shortDesc","description","duration",
  "videoUrl","logoImg","isPrivate","isPaid","showInProfile",
  "isPersonalized","equipment","trainingLevel","dayLinks","access",
 ].sort());
 expect(JSON.stringify(dto)).not.toContain(privateCanary);
});
it("actual server Core exception produces masked 500, never exposes private source",async()=>{
 m.course.mockRejectedValueOnce(Error(privateCanary));
 await startDom();await show("A","course_A");
 expect(host?.textContent).toContain("Не удалось загрузить черновик");
 expect(host?.textContent).not.toContain(privateCanary);
 expect(m.course).toHaveBeenCalledTimes(1);
});
it("actual Core null -> client sees masked 404, consistent with swallowed DB error semantics",async()=>{
 m.course.mockResolvedValueOnce(null);
 await expect(load("A","course_A")).rejects.toThrow("HTTP_404");
 expect(m.course).toHaveBeenCalledTimes(1);
});
it("retired epoch during actual Hono in-flight Core cannot publish response",async()=>{
 let release!:(data:unknown)=>void;
 let entered!:(value:void)=>void;
 const begun=new Promise<void>(resolve=>{entered=resolve;});
 m.course.mockImplementationOnce(()=>{
  entered();return new Promise<unknown>(resolve=>{release=resolve;});
 });
 await startDom();
 let now=live("A");
 const first=show("A","course_A",{reader:()=>now});
 await begun;
 now=live("A","epoch-new");
 release(courseData("course_A","trainer_A"));
 await first;
 expect(host?.textContent).not.toContain("Course course_A owner trainer_A");
 expect(m.course).toHaveBeenCalledTimes(1);
});
it("course X→Y→X real Hono late response cannot overwrite current selected course",async()=>{
 let release!:(data:unknown)=>void;
 let num=0;
 m.course.mockImplementation(async(id:string,actor:string)=>{
  num++;
  if(num===1)return new Promise<unknown>(resolve=>{release=resolve;});
  return courseData(id,actor);
 });
 await startDom();
 await show("A","course_A");
 await show("A","course_B");
 await show("A","course_A");
 release(courseData("course_A","trainer_B"));
 await actFn!(async()=>{await Promise.resolve();});
 expect(host?.textContent).toContain("Course course_A owner trainer_A");
 expect(host?.textContent).not.toContain("Course course_A owner trainer_B");
 expect(m.course).toHaveBeenCalledTimes(3);
});

it("mounted actor A→B→A same courseId rejects late first A private Hono response",async()=>{
 let release!:(data:unknown)=>void;
 let calls=0;
 m.course.mockImplementation(async(id:string,actor:string,scope:{allowAdmin:boolean})=>{
  calls++;
  if(calls===1)return new Promise<unknown>(resolve=>{release=resolve;});
  if(!scope.allowAdmin&&actor===identities.B.id)return null;
  return courseData(id,actor);
 });
 await startDom();
 await show("A","course_A");
 await show("B","course_A");
 expect(host?.textContent).toContain("Курс не найден или нет доступа");
 await show("A","course_A");
 expect(host?.textContent).toContain("Course course_A owner trainer_A");
 await actFn!(async()=>{
  release(courseData("course_A","PRIVATE_STALE_ACTOR_B"));
  await Promise.resolve();
 });
 expect(host?.textContent).toContain("Course course_A owner trainer_A");
 expect(host?.textContent).not.toContain("PRIVATE_STALE_ACTOR_B");
 expect(m.course.mock.calls).toEqual([
  ["course_A","trainer_A",{allowAdmin:false}],
  ["course_A","trainer_B",{allowAdmin:false}],
  ["course_A","trainer_A",{allowAdmin:false}],
 ]);
});
