// @vitest-environment node
/** AG4 TR018: prepared Trainer consumer → actual API app.ts, in-process only.
 * Real signed JWT/middleware, mocked Core/Prisma/Redis; no network/real DB.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type * as StatisticsModule from "@gafus/core/services/statistics";
const mock=vi.hoisted(()=>({
  findUser:vi.fn(), completed:vi.fn(),courses:vi.fn(),steps:vi.fn(),
  rateLimited:false,rateKeys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
  windowMs=60_000;
  init(opts:{windowMs:number}){this.windowMs=opts.windowMs;}
  async increment(key:string){mock.rateKeys.push(key);return {
    totalHits:mock.rateLimited?101:1,resetTime:new Date(Date.now()+this.windowMs),
  };}
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
}}));
vi.mock("@gafus/prisma",async(importOriginal)=>{
 const original=await importOriginal<typeof PrismaModule>();
 return {...original,prisma:{...original.prisma,user:{...original.prisma.user,
   findUnique:mock.findUser}}};
});
vi.mock("@gafus/core/services/auth",async(importOriginal)=>({
 ...await importOriginal<object>(),isRegistrationCompleted:mock.completed,
}));
vi.mock("@gafus/core/services/statistics",async(importOriginal)=>({
 ...await importOriginal<typeof StatisticsModule>(),
 getCourseStatistics:mock.courses,getStepStatistics:mock.steps,
}));
// API and Trainer build in separate tsconfig contexts. Runtime import still executes
// the real registered app and JWT signing, without falsely compiling API as Trainer.
const actualApiModule="../../../api/src/app";
const {app}=await vi.importActual<{
  app:{request:(path:string,init?:RequestInit)=>Promise<Response>},
}>(actualApiModule);
const jwtModule="@gafus/auth/jwt";
const {generateAccessToken}=await vi.importActual<{
  generateAccessToken:(input:{id:string;username:string;role:
    "TRAINER"|"ADMIN"|"MODERATOR"})=>Promise<string>,
}>(jwtModule);
import type {PanelActor} from "./consultationContract";
import {fetchProposedTrainerStatistics} from "./trainerStatisticsProposedConsumer";

const actors={A:{id:"TRAINER_A",role:"TRAINER" as const},
 B:{id:"TRAINER_B",role:"TRAINER" as const},
 ADMIN:{id:"ADMIN_1",role:"ADMIN" as const},
 MOD:{id:"MOD_1",role:"MODERATOR" as const}};
const tokens:Record<string,string>={};
const secret="PRIVATE_STUDENT_EMAIL_RECEIPT";
const rawCourse=(owner:string)=>({id:"COURSE_"+owner,name:"Course "+owner,
 logoImg:"",avgRating:null,isPrivate:false,isPaid:false,isPersonalized:false,
 trainingLevel:"BEGINNER",totalUsers:2,completedUsers:1,inProgressUsers:1,
 notStartedUsers:0,author:{username:owner,fullName:null},userCourses:[{email:secret}],
 reviews:[{comment:secret}],privateLedger:secret});
const courses=(ids:string[])=>({courses:ids.map(rawCourse),
 totalCourses:ids.length,totalDays:ids.length*2,privateLedger:secret});
const steps=(ids:string[])=>({steps:ids.map(owner=>({id:"STEP_"+owner,
 title:"Step "+owner,durationSec:45,usedInDaysCount:2,usedInCoursesCount:1,
 totalUsers:0,privateStudent:secret})),totalSteps:ids.length});
beforeAll(async()=>{
 vi.stubEnv("JWT_SECRET",randomBytes(48).toString("hex"));
 for(const [key,actor] of Object.entries(actors))tokens[key]=await generateAccessToken({
  id:actor.id,username:key.toLowerCase(),role:actor.role,
 });
});
afterAll(()=>vi.unstubAllEnvs());
beforeEach(()=>{
 vi.clearAllMocks();mock.rateLimited=false;mock.rateKeys.length=0;
 mock.completed.mockResolvedValue(true);
 mock.findUser.mockImplementation(async({where,select}:{
  where:{id:string};select:{role?:boolean;sessionsRevokedAt?:boolean},
 })=>{
  if(select.sessionsRevokedAt){
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  }
  if(select.role)return [actors.A.id,actors.B.id].includes(where.id)?{role:"TRAINER"}:null;
  throw Error("UNEXPECTED_PRISMA_READ");
 });
 mock.courses.mockImplementation(async(id:string,elevated:boolean)=>
  courses(elevated?[actors.A.id,actors.B.id]:[id]));
 mock.steps.mockImplementation(async(id:string,elevated:boolean)=>
  steps(elevated?[actors.A.id,actors.B.id]:[id]));
});
/** Do not call global fetch: Hono's actual app.request is entirely in-memory. */
const inProcessFetch:typeof fetch=async(input,init)=>{
 const value=typeof input==="string"?input:input instanceof URL?input.href:input.url;
 const uri=new URL(value,"http://localhost");
 const path=uri.pathname+uri.search;
 if(!path.startsWith("/api/v1/trainer/statistics/"))throw Error("UNEXPECTED_PATH");
 return app.request(path,{method:init?.method,headers:init?.headers,signal:init?.signal});
};
const live=(which:keyof typeof actors)=>({
 actor:actors[which] as PanelActor,token:tokens[which],authEpoch:"test-epoch",
});
async function read(which:keyof typeof actors,kind:"courses"|"steps",scope:
 {kind:"own"}|{kind:"all"}|{kind:"trainer";trainerUserId:string}){
 const p=live(which);
 return fetchProposedTrainerStatistics({actor:p.actor,token:p.token,kind,scope,
  fetchImpl:inProcessFetch,signal:new AbortController().signal,isCurrent:()=>true});
}
it("TRAINER JWT → ACTUAL app GET courses → client strict DTO strips private source",async()=>{
 const dto=await read("A","courses",{kind:"own"});
 expect(dto).toMatchObject({totalCourses:1,totalDays:2,courses:[{
  id:"COURSE_TRAINER_A",totalUsers:2,
 }]});
 expect(JSON.stringify(dto)).not.toContain(secret);
 expect(mock.courses).toHaveBeenCalledExactlyOnceWith("TRAINER_A",false);
 expect(mock.rateKeys.length).toBeGreaterThan(0);
});
it("A→B→A actual app plus consumer never mixes trainer ownership",async()=>{
 for(const who of ["A","B","A"] as const){
  const dto=await read(who,"courses",{kind:"own"});
  expect(JSON.stringify(dto)).toContain("COURSE_"+actors[who].id);
  expect(JSON.stringify(dto)).not.toContain("COURSE_"+
   actors[who==="A"?"B":"A"].id);
 }
 expect(mock.courses.mock.calls).toEqual([
  ["TRAINER_A",false],["TRAINER_B",false],["TRAINER_A",false],
 ]);
});
it("real app steps DTO has genuine usage and NOT_COMPUTED, passes parser",async()=>{
 const dto=await read("B","steps",{kind:"own"});
 expect(dto).toEqual({steps:[{id:"STEP_TRAINER_B",title:"Step TRAINER_B",
  durationSec:45,usedInDaysCount:2,usedInCoursesCount:1}],
  totalSteps:1,progressMetrics:"NOT_COMPUTED"});
 expect(JSON.stringify(dto)).not.toContain(secret);
});
it("real JWT ADMIN all and explicit verified TRAINER_B match client scope",async()=>{
 const global=await read("ADMIN","courses",{kind:"all"});
 expect(global).toMatchObject({totalCourses:2});
 expect(mock.courses).toHaveBeenCalledWith("ADMIN_1",true);
 const selected=await read("ADMIN","courses",{
  kind:"trainer",trainerUserId:"TRAINER_B",
 });
 expect(selected).toMatchObject({totalCourses:1,courses:[{id:"COURSE_TRAINER_B"}]});
 expect(mock.findUser).toHaveBeenCalledWith({
  where:{id:"TRAINER_B"},select:{role:true},
 });
 expect(mock.courses).toHaveBeenCalledWith("TRAINER_B",false);
});
it("valid missing ADMIN target yields actual-app 404 before Core",async()=>{
 await expect(read("ADMIN","courses",{
  kind:"trainer",trainerUserId:"MISSING_TRAINER",
 })).rejects.toThrow("HTTP_404");
 expect(mock.courses).not.toHaveBeenCalled();
});
it("synthetic Redis limiter actual app 429 is accepted by privacy validator",async()=>{
 mock.rateLimited=true;
 await expect(read("A","courses",{kind:"own"})).rejects.toThrow("HTTP_429");
 expect(mock.courses).not.toHaveBeenCalled();
});
it("actual app masks Core 500; client treats as error, no PII returned",async()=>{
 mock.courses.mockRejectedValueOnce(Error(secret));
 await expect(read("A","courses",{kind:"own"})).rejects.toThrow("HTTP_500");
});
it("actual app returns trusted empty aggregate and client accepts zero only when genuinely empty",async()=>{
 mock.courses.mockResolvedValueOnce(courses([]));
 const result=await read("A","courses",{kind:"own"});
 expect(result).toEqual({courses:[],totalCourses:0,totalDays:0});
});
it("actual mounted API rejects unsupported MODERATOR role for existing signed token",async()=>{
 const response=await app.request("/api/v1/trainer/statistics/courses",{
  headers:{authorization:"Bearer "+tokens.MOD},
 });
 expect(response.status).toBe(403);
 expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(mock.courses).not.toHaveBeenCalled();
});

it("late actual Hono Core response cannot satisfy retired client principal/epoch",async()=>{
 let release!:(raw:unknown)=>void;
 let entered!:(value:void)=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 mock.courses.mockImplementationOnce(()=>{
  entered();
  return new Promise<unknown>(resolve=>{release=resolve;});
 });
 const principal=live("A");
 let stillCurrent=true;
 const work=fetchProposedTrainerStatistics({actor:principal.actor,
  token:principal.token,kind:"courses",scope:{kind:"own"},
  fetchImpl:inProcessFetch,signal:new AbortController().signal,
  isCurrent:()=>stillCurrent,
 });
 await started;
 stillCurrent=false;
 release(courses(["TRAINER_A"]));
 await expect(work).rejects.toThrow("SESSION_RETIRED");
 expect(mock.courses).toHaveBeenCalledExactlyOnceWith("TRAINER_A",false);
});

it("mounted Trainer Vite screen → strict adapter → actual Hono app, verified JWT",async()=>{
 const {JSDOM}=await vi.importActual<{
  JSDOM:new(html:string,options:{url:string})=>{
    window:Window & typeof globalThis & {close:()=>void},
  },
 }>("jsdom");
 const dom=new JSDOM("<!doctype html><html><body></body></html>",{
  url:"http://localhost",
 });
 vi.stubGlobal("window",dom.window);
 vi.stubGlobal("document",dom.window.document);
 vi.stubGlobal("navigator",dom.window.navigator);
 vi.stubGlobal("HTMLElement",dom.window.HTMLElement);
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const {act,createElement}=await import("react");
 const {createRoot}=await import("react-dom/client");
 const {TrainerOptInRoute}=await import("./optInRoute");
 const host=dom.window.document.createElement("div");
 dom.window.document.body.append(host);
 const root=createRoot(host);
 const session=live("A");
 try{
  const render=(enabled:boolean)=>createElement(TrainerOptInRoute,{
   pathname:"/main-panel/statistics",actor:session.actor,
   token:session.token,authEpoch:session.authEpoch,
   getCurrentSession:()=>session,fetchImpl:inProcessFetch,
   enableProposedStatistics:enabled,
  });
  await act(async()=>root.render(render(false)));
  expect(host.textContent).toContain("Запросы отключены");
  expect(mock.courses).not.toHaveBeenCalled();
  expect(mock.rateKeys).toHaveLength(0);
  await act(async()=>root.render(render(true)));
  expect(host.textContent).toContain("Course TRAINER_A");
  expect(host.textContent).toContain("участников: 2");
  expect(host.textContent).not.toContain(secret);
  expect(mock.courses).toHaveBeenCalledExactlyOnceWith("TRAINER_A",false);
 }finally{
  await act(async()=>root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
 }
});

it("mounted ADMIN UI refuses implicit all, then uses actual verified trainer scope",async()=>{
 const {JSDOM}=await vi.importActual<{
  JSDOM:new(html:string,options:{url:string})=>{
    window:Window & typeof globalThis & {close:()=>void},
  },
 }>("jsdom");
 const dom=new JSDOM("<!doctype html><html><body></body></html>",{
  url:"http://localhost",
 });
 vi.stubGlobal("window",dom.window);
 vi.stubGlobal("document",dom.window.document);
 vi.stubGlobal("navigator",dom.window.navigator);
 vi.stubGlobal("HTMLElement",dom.window.HTMLElement);
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const {act,createElement}=await import("react");
 const {createRoot}=await import("react-dom/client");
 const {TrainerOptInRoute}=await import("./optInRoute");
 const host=dom.window.document.createElement("div");
 dom.window.document.body.append(host);
 const root=createRoot(host);
 const session=live("ADMIN");
 try{
  await act(async()=>root.render(createElement(TrainerOptInRoute,{
   pathname:"/main-panel/statistics",actor:session.actor,
   token:session.token,authEpoch:session.authEpoch,
   getCurrentSession:()=>session,fetchImpl:inProcessFetch,
   enableProposedStatistics:true,
  })));
  expect(host.textContent).toContain("Выберите область статистики");
  expect(mock.courses).not.toHaveBeenCalled();
  expect(mock.rateKeys).toHaveLength(0);
  const all=[...host.querySelectorAll("button")].find(b=>b.textContent==="Все тренеры");
  expect(all).toBeDefined();
  await act(async()=>all?.click());
  expect(host.textContent).toContain("Курсов: 2");
  expect(mock.courses).toHaveBeenCalledWith("ADMIN_1",true);
  const field=host.querySelector(
    'input[aria-label="ID кинолога для статистики"]',
  ) as HTMLInputElement;
  expect(field).not.toBeNull();
  await act(async()=>{
   Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,
    "value")?.set?.call(field,"TRAINER_B");
   field.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
   field.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
  });
  const choose=[...host.querySelectorAll("button")].find(b=>
   b.textContent==="Показать кинолога");
  expect(choose).toBeDefined();
  await act(async()=>choose?.click());
  expect(host.textContent).toContain("Course TRAINER_B");
  expect(host.textContent).not.toContain("Course TRAINER_A");
  expect(mock.findUser).toHaveBeenCalledWith({where:{id:"TRAINER_B"},select:{role:true}});
  expect(mock.courses).toHaveBeenCalledWith("TRAINER_B",false);
 }finally{
  await act(async()=>root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
 }
});
