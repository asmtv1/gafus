// @vitest-environment jsdom
/** TR012 scoped MOCK-only contract on existing Core CourseDraftDto; API method not mounted. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {TrainerOptInRoute} from "./optInRoute";
import {mountTrainerEntry} from "./mountTrainerEntry";
import type {PanelActor} from "./consultationContract";
import {
 extractCourseDraftId,parseTrainerCourseDraftEnvelope,
 readTrainerCourseDraft,trainerCourseDraftPath,
} from "./trainerCourseDraftReadContract";
const courseId="cmf7draft-abc_1";
const route=`/main-panel/courses/${courseId}/edit`;
const A:PanelActor={id:"trainer-A",role:"TRAINER"};
const B:PanelActor={id:"trainer-B",role:"TRAINER"};
const ADMIN:PanelActor={id:"admin_1",role:"ADMIN"};
const token="TEST_BEARER_ONLY",epoch="epoch-1";
const dto=(id=courseId,name="PRIVATE_COURSE_A")=>({
 id,name,guideContent:"Intro",shortDesc:"Small",description:"Details",
 duration:"30 минут",videoUrl:null,logoImg:"",isPrivate:true,
 isPaid:false,showInProfile:true,isPersonalized:false,equipment:"",
 trainingLevel:"BEGINNER",dayLinks:[{
  id:"daylink-1",dayId:"day-1",order:1,day:{id:"day-1",title:"День 1"},
 }],access:[{userId:"user-1",user:{id:"user-1",username:"PRIVATE_USER"}}],
});
const ok=(data:unknown,status=200,headers=true)=>new Response(
 JSON.stringify(status===200?{success:true,data}:{success:false,code:"HIDDEN",error:"PRIVATE_SQL"}),
 {status,headers:headers?{"cache-control":"private, no-store",
  "referrer-policy":"no-referrer"}:{"cache-control":"public,max-age=300"}},
);
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(f:typeof fetch,actor:PanelActor=A,enabled=true,
 read?:()=>{actor:PanelActor;token:string|null;authEpoch?:string}|null,
 pathname=route,credential:string|null=token){
 await act(async()=>root.render(createElement(TrainerOptInRoute,{
  pathname,actor,token:credential,authEpoch:epoch,
  getCurrentSession:read,fetchImpl:f,enableProposedCourseDraft:enabled,
 })));
}
async function retry(){
 const button=host.querySelector(
  'button[aria-label="Повторить чтение черновика"]',
 ) as HTMLButtonElement;
 expect(button).not.toBeNull();await act(async()=>button.click());
}
it("the default direct-link + reload is fail-closed even when mocked fetch is provided",async()=>{
 const f=vi.fn(async()=>ok(dto()));await mount(f,A,false);
 expect(host.textContent).toContain("Запросы отключены");
 expect(host.querySelector(`a[href="${route}"]`)).not.toBeNull();
 expect(f).not.toHaveBeenCalled();
 await act(async()=>root.unmount());root=createRoot(host);
 await mount(f,A,false);expect(f).not.toHaveBeenCalled();
});
it("actual opt-in Trainer entry renders Core-compatible private draft, never creates mutation",async()=>{
 const f=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>ok(dto()));
 await act(async()=>root.unmount());
 await act(async()=>{root=mountTrainerEntry(host,{
  pathname:route,actor:A,token,authEpoch:epoch,
  fetchImpl:f,enableProposedCourseDraft:true,
 });});
 expect(f).toHaveBeenCalledTimes(1);
 expect(f.mock.calls[0][0]).toBe(`/api/v1/trainer/courses/${courseId}/draft`);
 expect(f.mock.calls[0][1]).toMatchObject({method:"GET",cache:"no-store",
  referrerPolicy:"no-referrer"});
 expect((f.mock.calls[0][1]?.headers as Record<string,string>).Authorization)
  .toBe("Bearer "+token);
 expect(host.textContent).toContain("PRIVATE_COURSE_A");
 expect(host.textContent).toContain("День 1");
 expect(host.textContent).toContain("Пользователей с доступом: 1");
 expect(host.textContent).not.toContain("PRIVATE_USER");
 expect(host.textContent).toContain("Редактирование и загрузка изображений пока отключены");
 expect(host.querySelector("form")).toBeNull();
});
it("ADMIN explicitly uses own verified ADMIN principal; no client override of authorId",async()=>{
 const f=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>ok(dto()));
 await mount(f,ADMIN);
 expect(f).toHaveBeenCalledTimes(1);
 expect(f.mock.calls[0][0]).toBe(`/api/v1/trainer/courses/${courseId}/draft`);
 expect(String(f.mock.calls[0][0])).not.toContain("userId=");
});
for(const role of ["MODERATOR","USER","GUEST","PARTNER"] as const){
 it(`${role} never reads another trainer's draft`,async()=>{
  const f=vi.fn(async()=>ok(dto()));
  await mount(f,{id:"other",role});
  expect(f).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Доступ к курсу не подтверждён");
  expect(host.textContent).not.toContain("PRIVATE_COURSE_A");
 });
}
it("revoked session or missing bearer blocks read on mount/retry",async()=>{
 const f=vi.fn(async()=>ok(dto()));
 await mount(f,A,true,()=>null);expect(f).not.toHaveBeenCalled();
 await mount(f,A,true,undefined,route,null);expect(f).not.toHaveBeenCalled();
});
for(const status of [401,403,404,409,429,500]){
 it(`HTTP ${status} hides body/private content, 404 masks foreign owner`,async()=>{
  const f=vi.fn(async()=>ok({},status));await mount(f);
  expect(f).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain("PRIVATE_SQL");
  expect(host.textContent).not.toContain("PRIVATE_COURSE_A");
  expect(host.querySelector("form")).toBeNull();
  if(status===404){
   expect(host.textContent).toContain("Курс не найден или нет доступа");
   expect(host.querySelector('button[aria-label="Повторить чтение черновика"]'))
    .toBeNull();
  }else expect(host.textContent).toContain("Не удалось загрузить черновик");
 });
}
it("transient failed GET recovers only after explicit manual GET retry",async()=>{
 let n=0;
 const f=vi.fn(async(_url:RequestInfo|URL,_opts?:RequestInit)=>
  ++n===1?ok({},500):ok(dto()));
 await mount(f);expect(host.textContent).toContain("Не удалось загрузить черновик");
 expect(f).toHaveBeenCalledTimes(1);
 await retry();
 expect(host.textContent).toContain("PRIVATE_COURSE_A");
 expect(f.mock.calls).toHaveLength(2);
 expect(f.mock.calls.every(c=>c[1]?.method==="GET")).toBe(true);
});
it("rapid double retry stays one in-flight GET",async()=>{
 let n=0,finish!:(response:Response)=>void;
 const f=vi.fn(async()=>++n===1?ok({},500):
  new Promise<Response>(resolve=>{finish=resolve;}));
 await mount(f);
 const b=host.querySelector(
  'button[aria-label="Повторить чтение черновика"]',
 ) as HTMLButtonElement;
 expect(b).not.toBeNull();
 await act(async()=>{b.click();b.click();});
 expect(f).toHaveBeenCalledTimes(2);
 await act(async()=>finish(ok(dto())));
 expect(host.textContent).toContain("PRIVATE_COURSE_A");
});
it("same logical trainer with cloned actor/session-reader does not issue duplicate GET",async()=>{
 const f=vi.fn(async()=>ok(dto()));
 await mount(f,A,true,()=>({actor:A,token,authEpoch:epoch}));
 await mount(f,{...A},true,()=>({actor:{...A},token,authEpoch:epoch}));
 expect(f).toHaveBeenCalledTimes(1);
 expect(host.textContent).toContain("PRIVATE_COURSE_A");
});
it("A→B→A retired late response cannot republish PRIVATE_STALE_CONTENT",async()=>{
 let finish!:(res:Response)=>void,n=0;
 const f=vi.fn(async()=>{
  if(++n===1)return new Promise<Response>(resolve=>{finish=resolve;});
  return ok(dto(courseId,n===2?"CURRENT_B":"CURRENT_A"));
 });
 await mount(f,A);await mount(f,B);await mount(f,{...A});
 await act(async()=>finish(ok(dto(courseId,"PRIVATE_STALE_CONTENT"))));
 expect(host.textContent).toContain("CURRENT_A");
 expect(host.textContent).not.toContain("PRIVATE_STALE_CONTENT");
 expect(f).toHaveBeenCalledTimes(3);
});
it("path IDs accept current Core UUID/CUID-like IDs, reject traversal, Unicode and whitespace",()=>{
 expect(extractCourseDraftId(route)).toBe(courseId);
 expect(extractCourseDraftId("/main-panel/courses/uuid-123/edit")).toBe("uuid-123");
 expect(extractCourseDraftId("/main-panel/courses/%2e%2e/edit")).toBeNull();
 expect(extractCourseDraftId("/main-panel/courses/%FF/edit")).toBeNull();
 expect(extractCourseDraftId("/main-panel/courses/%20abc/edit")).toBeNull();
 expect(()=>trainerCourseDraftPath("../bad",A)).toThrow();
 expect(()=>trainerCourseDraftPath(courseId,{id:"mod",role:"MODERATOR"})).toThrow();
});
it("fail closed: malformed/private DTO, foreign course ID, inconsistent day/user joins",()=>{
 for(const invalid of [
  {...dto(),id:"foreign-course"},
  {...dto(),reviewers:[{email:"PRIVATE_EMAIL"}]},
  {...dto(),trainingLevel:"unsupported"},
  {...dto(),dayLinks:[{...dto().dayLinks[0],day:{id:"other",title:"wrong"}}]},
  {...dto(),access:[{userId:"user-1",user:{id:"other",username:"secret"}}]},
  {...dto(),isPaid:"true"},
 ]){
  expect(()=>parseTrainerCourseDraftEnvelope({success:true,data:invalid},courseId))
   .toThrow();
 }
 expect(()=>parseTrainerCourseDraftEnvelope({success:true,data:dto(),privateMeta:"X"},courseId))
  .toThrow();
});
it("unsafe response headers are rejected before any course title is displayed",async()=>{
 const f=vi.fn(async()=>ok(dto(),200,false));await mount(f);
 expect(host.textContent).toContain("Не удалось загрузить черновик");
 expect(host.textContent).not.toContain("PRIVATE_COURSE_A");
});
it("stale session during async response rejects DTO and reveals no protected fields",async()=>{
 let finish!:(response:Response)=>void;
 const f=vi.fn(async()=>new Promise<Response>(resolve=>{finish=resolve;}));
 let principal:{actor:PanelActor;token:string|null;authEpoch?:string}|null={
  actor:A,token,authEpoch:epoch,
 };
 await mount(f,A,true,()=>principal);
 principal=null;
 await act(async()=>finish(ok(dto())));
 expect(host.textContent).not.toContain("PRIVATE_COURSE_A");
 await mount(f,A,true,()=>principal);
 expect(host.textContent).toContain("Доступ к курсу не подтверждён");
});
it("POST, PUT, PATCH, DELETE and media transport are absent from approved reader",async()=>{
 const calls:string[]=[];
 const fetchImpl:typeof fetch=async(_url,init)=>{
  calls.push(init?.method??"UNKNOWN");return ok(dto());
 };
 await readTrainerCourseDraft({actor:A,courseId,token,
  fetchImpl,signal:new AbortController().signal,isCurrent:()=>true});
 expect(calls).toEqual(["GET"]);
});

it("same principal course X→Y→X never publishes retired X GET result",async()=>{
 const otherId="different-course-2";
 let finish!:(res:Response)=>void,n=0;
 const f=vi.fn(async(url:RequestInfo|URL)=>{
  if(++n===1)return new Promise<Response>(resolve=>{finish=resolve;});
  return ok(dto(String(url).includes(otherId)?otherId:courseId,
   n===2?"CURRENT_OTHER":"CURRENT_ORIGINAL"));
 });
 await mount(f);
 await mount(f,A,true,undefined,`/main-panel/courses/${otherId}/edit`);
 expect(host.textContent).toContain("CURRENT_OTHER");
 await mount(f,A,true,undefined,route);
 await act(async()=>finish(ok(dto(courseId,"STALE_PRIVATE_ORIGINAL"))));
 expect(host.textContent).toContain("CURRENT_ORIGINAL");
 expect(host.textContent).not.toContain("STALE_PRIVATE_ORIGINAL");
 expect(f).toHaveBeenCalledTimes(3);
});
it("invalid JSON fails closed without automatic GET replay",async()=>{
 const f=vi.fn(async()=>new Response("{bad-json",{status:200,
  headers:{"cache-control":"private, no-store","referrer-policy":"no-referrer"}}));
 await mount(f);
 expect(host.textContent).toContain("Не удалось загрузить черновик");
 expect(f).toHaveBeenCalledTimes(1);
});
it("a valid response after explicit unmount never restores private course markup",async()=>{
 let finish!:(res:Response)=>void;
 const f=vi.fn(async()=>new Promise<Response>(resolve=>{finish=resolve;}));
 await mount(f);
 await act(async()=>root.unmount());
 root=createRoot(host);
 await act(async()=>finish(ok(dto(courseId,"PRIVATE_UNMOUNTED"))));
 expect(host.textContent).not.toContain("PRIVATE_UNMOUNTED");
 expect(f).toHaveBeenCalledTimes(1);
});

it("conflicting public and private cache directives cannot expose a trainer draft",async()=>{
 const f:typeof fetch=async()=>new Response(JSON.stringify({success:true,data:dto()}),{
  status:200,headers:{"cache-control":"public, private, no-store",
    "referrer-policy":"no-referrer"},
 });
 await mount(f);
 expect(host.textContent).not.toContain("PRIVATE_COURSE_A");
 expect(host.textContent).toContain("Не удалось загрузить черновик");
});
