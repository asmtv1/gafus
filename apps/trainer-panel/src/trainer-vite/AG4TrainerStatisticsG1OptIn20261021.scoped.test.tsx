// @vitest-environment jsdom
/** AG4 TR018: actual Vite opt-in, fixture-only read of proposed unmounted AG1 GETs. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {TrainerOptInRoute} from "./optInRoute";
import {mountTrainerEntry} from "./mountTrainerEntry";
import type {PanelActor} from "./consultationContract";
import {proposedTrainerStatisticsPath,parseProposedStatistics} from "./trainerStatisticsProposedConsumer";
const A:PanelActor={id:"TRAINER_A",role:"TRAINER"};
const B:PanelActor={id:"TRAINER_B",role:"TRAINER"};
const ADMIN:PanelActor={id:"ADMIN_1",role:"ADMIN"};
const token="TEST_TOKEN",epoch="E1";
const course=(id:string)=>({id:"COURSE_"+id,name:"Курс "+id,logoImg:"",avgRating:null,
 isPrivate:false,isPaid:false,isPersonalized:false,trainingLevel:"BEGINNER",totalUsers:2,
 completedUsers:1,inProgressUsers:1,notStartedUsers:0,author:{username:id,fullName:null}});
const courses=(ids:string[])=>({courses:ids.map(course),
 totalCourses:ids.length,totalDays:ids.length*2});
const steps=(id:string)=>({steps:[{id:"STEP_"+id,title:"Шаг "+id,durationSec:30,
 usedInDaysCount:2,usedInCoursesCount:1}],totalSteps:1,progressMetrics:"NOT_COMPUTED"});
const ok=(data:unknown,status=200,cache="private, no-store")=>new Response(
 JSON.stringify(status===200?{success:true,data}:{success:false,code:"FORBIDDEN",error:"PRIVATE_SQL"}),
 {status,headers:{"cache-control":cache,"referrer-policy":"no-referrer"}});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(f:typeof fetch,actor:PanelActor=A,enable=true,
 read?:()=>{actor:PanelActor;token:string|null;authEpoch?:string}|null,
 credential:string|null=token){
 await act(async()=>root.render(createElement(TrainerOptInRoute,{
  pathname:"/main-panel/statistics",actor,token:credential,authEpoch:epoch,
  fetchImpl:f,getCurrentSession:read,enableProposedStatistics:enable,
 })));
}
async function press(label:string){
 const b=[...host.querySelectorAll("button")].find(x=>x.textContent===label);
 expect(b).toBeDefined();await act(async()=>b?.click());
}
async function inputId(s:string){
 const x=host.querySelector('input[aria-label="ID кинолога для статистики"]') as HTMLInputElement;
 expect(x).not.toBeNull();await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(x,s);
  x.dispatchEvent(new Event("input",{bubbles:true}));
  x.dispatchEvent(new Event("change",{bubbles:true}));
 });
}
it("default opt-in route on direct URL and reload never sends unmounted HTTP request",async()=>{
 const f=vi.fn(async()=>ok(courses(["A"])));await mount(f,A,false);
 expect(host.textContent).toContain("Запросы отключены");
 expect(host.querySelector('a[href="/main-panel/statistics"]')).not.toBeNull();
 await act(async()=>root.unmount());root=createRoot(host);
 await mount(f,A,false);expect(f).not.toHaveBeenCalled();
});
it("real mounted Vite entry renders own course aggregate from TEST fetch, no student data",async()=>{
 const f=vi.fn(async(_u:RequestInfo|URL,_i?:RequestInit)=>ok(courses(["TRAINER_A"])));
 await act(async()=>root.unmount());
 await act(async()=>{root=mountTrainerEntry(host,{pathname:"/main-panel/statistics",
  actor:A,token,authEpoch:epoch,fetchImpl:f,enableProposedStatistics:true});});
 expect(f).toHaveBeenCalledTimes(1);
 expect(f.mock.calls[0][0]).toBe("/api/v1/trainer/statistics/courses");
 expect(host.textContent).toContain("Курсов: 1");
 expect(host.textContent).toContain("участников: 2");
});
it("TRAINER GET is always own-scoped, and empty report has honest empty state",async()=>{
 const f=vi.fn(async(_u:RequestInfo|URL,_i?:RequestInit)=>ok(courses([])));
 await mount(f);
 expect(f).toHaveBeenCalledTimes(1);
 expect(f.mock.calls[0][0]).toBe("/api/v1/trainer/statistics/courses");
 expect(host.textContent).toContain("Курсы не найдены");
});
it("step tab displays real usage and NOT_COMPUTED message, not fake progress",async()=>{
 const f=vi.fn(async(url:RequestInfo|URL)=>ok(String(url).endsWith("steps")?
  steps("TRAINER_A"):courses([])));
 await mount(f);await press("Шаги");
 expect(f).toHaveBeenCalledTimes(2);
 expect(f.mock.calls[1][0]).toBe("/api/v1/trainer/statistics/steps");
 expect(host.textContent).toContain("используется в днях: 2, в курсах: 1");
 expect(host.textContent).toContain("Прогресс пользователей для шагов не рассчитывается");
});
it("ADMIN cannot implicitly elevate; must explicitly select all or trainer",async()=>{
 const f=vi.fn(async(url:RequestInfo|URL)=>ok(courses(
  String(url).includes("scope=all")?["TRAINER_A","TRAINER_B"]:["TRAINER_B"])));
 await mount(f,ADMIN);expect(f).not.toHaveBeenCalled();
 await press("Все тренеры");
 expect(f.mock.calls[0][0]).toBe("/api/v1/trainer/statistics/courses?scope=all");
 expect(host.textContent).toContain("Курсов: 2");
 await inputId("TRAINER_B");await press("Показать кинолога");
 expect(f.mock.calls[1][0]).toBe(
 "/api/v1/trainer/statistics/courses?scope=trainer&trainerUserId=TRAINER_B");
 expect(host.textContent).not.toContain("Курс TRAINER_A");
});
it("ADMIN invalid target cannot dispatch a lookup",async()=>{
 const f=vi.fn(async()=>ok(courses([])));
 await mount(f,ADMIN);await inputId("../../bad");await press("Показать кинолога");
 expect(f).not.toHaveBeenCalled();
});
for(const role of ["MODERATOR","GUEST","USER","PARTNER"] as const){
 it(`${role} cannot perform private stats GET`,async()=>{
  const f=vi.fn(async()=>ok(courses(["TRAINER_A"])));
  await mount(f,{id:"someone",role});
  expect(f).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Доступ к статистике не подтверждён");
 });
}
for(const status of [401,404,409,500]){
 it(`HTTP ${status}: generic error and one explicit read-only retry`,async()=>{
  let n=0;const f=vi.fn(async()=>++n===1?ok({},status):ok(courses([])));
  await mount(f);expect(host.textContent).toContain("Не удалось загрузить статистику");
  expect(host.textContent).not.toContain("PRIVATE_SQL");
  await press("Повторить загрузку");
  expect(host.textContent).toContain("Курсы не найдены");
  expect(f).toHaveBeenCalledTimes(2);
 });
}
it("public cache and private DTO source fields fail closed",async()=>{
 const f=vi.fn(async()=>ok(courses(["TRAINER_A"]),200,"public, max-age=600"));
 await mount(f);expect(host.textContent).toContain("Не удалось загрузить статистику");
 const privateValue={...courses(["TRAINER_A"]),courses:[{
  ...course("TRAINER_A"),userCourses:[{email:"SECRET_PRIVATE"}],
 }]};
 await mount(vi.fn(async()=>ok(privateValue)));
 expect(host.textContent).toContain("Не удалось загрузить статистику");
 expect(host.textContent).not.toContain("SECRET_PRIVATE");
});
it("malformed totals and step placeholder missing fail closed",async()=>{
 expect(()=>parseProposedStatistics("courses",{
  success:true,data:{...courses(["TRAINER_A"]),totalCourses:900},
 })).toThrow();
 expect(()=>parseProposedStatistics("steps",{
  success:true,data:{...steps("A"),progressMetrics:"COMPUTED"},
 })).toThrow();
});
it("same logical trainer with cloned actor and reader retains data, no repeat GET",async()=>{
 const f=vi.fn(async()=>ok(courses(["TRAINER_A"])));
 await mount(f,A,true,()=>({actor:A,token,authEpoch:epoch}));
 await mount(f,{...A},true,()=>({actor:A,token,authEpoch:epoch}));
 expect(f).toHaveBeenCalledTimes(1);
 expect(host.textContent).toContain("Курс TRAINER_A");
});
it("A→B→A pending old A cannot overwrite new A statistics",async()=>{
 let done!:(r:Response)=>void;let n=0;
 const f=vi.fn(async()=>{
  if(++n===1)return new Promise<Response>(resolve=>{done=resolve;});
  return ok(courses([n===2?"TRAINER_B":"TRAINER_A"]));
 });
 await mount(f,A);await mount(f,B);await mount(f,{...A});
 await act(async()=>done(ok(courses(["OLD_PRIVATE_A"]))));
 expect(host.textContent).toContain("Курс TRAINER_A");
 expect(host.textContent).not.toContain("OLD_PRIVATE_A");
 expect(f).toHaveBeenCalledTimes(3);
});
it("scope builders reject forged elevation, foreign trainer, unsafe target",()=>{
 expect(()=>proposedTrainerStatisticsPath(A,"courses",{kind:"all"})).toThrow();
 expect(()=>proposedTrainerStatisticsPath(A,"steps",{kind:"trainer",trainerUserId:"B"})).toThrow();
 expect(()=>proposedTrainerStatisticsPath(ADMIN,"courses",{kind:"own"})).toThrow();
 expect(()=>proposedTrainerStatisticsPath(ADMIN,"courses",{
  kind:"trainer",trainerUserId:"../A",
 })).toThrow();
});

it("proposed transport is read-only and denies caching or referer leakage",async()=>{
 const f=vi.fn(async(_url:RequestInfo|URL,_opts?:RequestInit)=>ok(courses([])));
 await mount(f);
 const [url,init]=f.mock.calls[0];
 expect(url).toBe("/api/v1/trainer/statistics/courses");
 expect(init).toMatchObject({method:"GET",cache:"no-store",referrerPolicy:"no-referrer"});
 expect((init?.headers as Record<string,string>).Authorization).toBe("Bearer "+token);
});
it("missing response Referrer-Policy is unsafe even if private/no-store",async()=>{
 const f=vi.fn(async()=>new Response(JSON.stringify({success:true,data:courses(["TRAINER_A"])}),{
  status:200,headers:{"cache-control":"private, no-store"}}));
 await mount(f);
 expect(host.textContent).toContain("Не удалось загрузить статистику");
 expect(host.textContent).not.toContain("Курс TRAINER_A");
});


// AG2-STAT-SELF403: existing in-process mounted TRAINER self read cases only.
describe("AG2-STAT-SELF403 ordinary TRAINER self READ UX",()=>{
 it.each(["courses","steps"] as const)("%s 200 then 403 denies without retry or stale counts",async kind=>{
  const ready=vi.fn(async(url:RequestInfo|URL)=>ok(String(url).endsWith("steps")?
   steps("SELF_OLD"):courses(["SELF_OLD"])));
  await mount(ready,A);
  if(kind==="steps")await press("Шаги");
  expect(host.textContent).toContain(kind==="courses"?"Курс SELF_OLD":"Шаг SELF_OLD");
  const denied=vi.fn(async()=>ok({},403));
  await mount(denied,A);
  expect(denied).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Нет доступа к своей статистике");
  expect(host.textContent).not.toContain("SELF_OLD");
  expect(host.textContent).not.toContain("Курсов:");
  expect(host.textContent).not.toContain("Шагов:");
  expect(host.querySelector('button[aria-label="Повторить чтение статистики"]')).toBeNull();
  expect(host.querySelector('a[href="/main-panel"]')).not.toBeNull();
 });
 it.each(["courses","steps"] as const)("%s 503 manual retry then fresh self 200",async kind=>{
  const paths:string[]=[];
  let count=0;
  const transport=vi.fn(async(url:RequestInfo|URL)=>{
   const path=String(url);paths.push(path);
   if(kind==="steps"&&path.endsWith("courses"))return ok(courses([]));
   count++;
   return count===1?ok({},503):ok(kind==="steps"?steps("FRESH_SELF"):courses(["FRESH_SELF"]));
  });
  await mount(transport,A);
  if(kind==="steps")await press("Шаги");
  expect(host.textContent).toContain("Не удалось загрузить статистику");
  expect(host.textContent).not.toContain("FRESH_SELF");
  await press("Повторить загрузку");
  expect(host.textContent).toContain(kind==="steps"?"Шаг FRESH_SELF":"Курс FRESH_SELF");
  expect(count).toBe(2);
  const target=`/api/v1/trainer/statistics/${kind}`;
  expect(paths.filter(path=>path===target)).toEqual([target,target]);
 });
 it("self 401 stays generic error with manual retry",async()=>{
  const f=vi.fn(async()=>ok({},401));
  await mount(f,A);
  expect(host.textContent).toContain("Не удалось загрузить статистику");
  expect(host.querySelector('button[aria-label="Повторить чтение статистики"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Нет доступа к своей статистике");
 });
 it("late old-epoch success cannot replace new self 403 or restore rows",async()=>{
  let deliver!:(response:Response)=>void;
  const old=vi.fn(async()=>new Promise<Response>(resolve=>{deliver=resolve;}));
  await mount(old,A);
  const newEpoch="EPOCH_NEW";
  const denied=vi.fn(async()=>ok({},403));
  await act(async()=>root.render(createElement(TrainerOptInRoute,{
   pathname:"/main-panel/statistics",actor:A,token,authEpoch:newEpoch,
   fetchImpl:denied,enableProposedStatistics:true,
   getCurrentSession:()=>({actor:A,token,authEpoch:newEpoch}),
  })));
  expect(denied).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Нет доступа к своей статистике");
  await act(async()=>deliver(ok(courses(["STALE_EPOCH_PRIVATE"]))));
  expect(host.textContent).not.toContain("STALE_EPOCH_PRIVATE");
  expect(host.textContent).toContain("Нет доступа к своей статистике");
  expect(host.querySelector('button[aria-label="Повторить чтение статистики"]')).toBeNull();
 });
});
