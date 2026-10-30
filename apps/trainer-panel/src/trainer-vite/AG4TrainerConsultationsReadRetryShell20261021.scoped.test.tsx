// @vitest-environment jsdom
/** AG4: actual TRAINER opt-in bookings manual GET retry without mutation or private leakage. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {TrainerOptInRoute} from "./optInRoute";
import type {PanelActor} from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const session={actor,token:"TEST_TOKEN",authEpoch:"epoch-a"};
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{
 status:200,headers:{"cache-control":"private, no-store"}});
const fail=(status:number)=>new Response(JSON.stringify({success:false,error:"PRIVATE_SERVER_ERROR"}),{
 status,headers:{"cache-control":"private, no-store"}});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const booking=(owner="trainer-a")=>({id:"booking-a",status:"CONFIRMED",
 cynologistUserId:owner,confirmationDeadlineAt:"2026-11-03T10:00:00Z",
 createdAt:"2026-10-20T10:00:00Z",slot:{id:"slot-a",
 startAtUtc:"2026-11-04T09:00:00Z",endAtUtc:"2026-11-04T09:30:00Z"}});
async function mount(fetchImpl:typeof fetch,person:PanelActor=actor,
 read:()=>typeof session|null=()=>session){
 await act(async()=>root.render(createElement(TrainerOptInRoute,{
  pathname:"/main-panel/consultations",actor:person,
  token:session.token,authEpoch:session.authEpoch,getCurrentSession:read,fetchImpl,
 })));
}
async function retry(){const button=host.querySelector('button[aria-label="Повторить загрузку консультаций"]') as HTMLButtonElement;
 expect(button).not.toBeNull();await act(async()=>button.click());}
for(const status of [401,403,404,409]){
 it(`GET ${status} shows no private list and retries once only after explicit action`,async()=>{
  let reads=0;
  const f=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>
    ++reads===1?fail(status):ok([]));
  await mount(f);
  expect(host.textContent).toContain("Не удалось получить данные");
  expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
  expect(host.querySelector('a[href="/main-panel/consultations"]')).not.toBeNull();
  expect(f).toHaveBeenCalledTimes(1);
  await retry();
  expect(host.textContent).toContain("Данные получены: 0");
  expect(host.textContent).toContain("Записей пока нет");
  expect(f).toHaveBeenCalledTimes(2);
  expect(f.mock.calls.every(c=>c[1]?.method==="GET")).toBe(true);
 });
}
it("owner-mismatched GET never publishes a foreign booking, retry remains readonly",async()=>{
 let reads=0;const f=vi.fn(async()=>ok(++reads===1?[booking("trainer-b")]:[]));
 await mount(f);
 expect(host.textContent).toContain("Не удалось получить данные");
 expect(host.textContent).not.toContain("booking-a");
 await retry();expect(f).toHaveBeenCalledTimes(2);
 expect(host.textContent).toContain("Записей пока нет");
});
for(const role of ["GUEST","USER","PARTNER","MODERATOR"] as const){
 it(`${role} cannot see links/retry and does not GET owner bookings`,async()=>{
  const person:PanelActor={...actor,role};
  const f=vi.fn(async()=>ok([]));
  await mount(f,person,()=>({...session,actor:person}));
  expect(f).not.toHaveBeenCalled();
  expect(host.querySelector('nav[aria-label="Консультации кинолога"]')).toBeNull();
  expect(host.querySelector('button[aria-label="Повторить загрузку консультаций"]')).toBeNull();
 });
}
it("session retired after GET error hides retry and does not issue another GET",async()=>{
 let current:typeof session|null=session;
 const f=vi.fn(async()=>fail(401));await mount(f,actor,()=>current);
 expect(host.querySelector('button[aria-label="Повторить загрузку консультаций"]')).not.toBeNull();
 current=null;await mount(f,actor,()=>current);
 expect(host.querySelector('button[aria-label="Повторить загрузку консультаций"]')).toBeNull();
 expect(f).toHaveBeenCalledTimes(1);
});

it("A→B→A while first A GET is pending never publishes old A private booking",async()=>{
 let live:{actor:PanelActor;token:string;authEpoch:string}|null={...session};
 let finish!:(response:Response)=>void;
 let reads=0;
 const f=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>{
  if(++reads===1)return new Promise<Response>(done=>{finish=done;});
  return ok([]);
 });
 await mount(f,actor,()=>live);
 expect(host.textContent).toContain("Загрузка консультаций");
 const other:PanelActor={id:"trainer-b",role:"TRAINER"};
 live={...session,actor:other};
 await mount(f,other,()=>live);
 expect(host.textContent).toContain("Данные получены: 0");
 live={...session};
 await mount(f,actor,()=>live);
 expect(host.textContent).toContain("Данные получены: 0");
 await act(async()=>finish(ok([booking("trainer-a")])));
 expect(host.textContent).not.toContain("booking-a");
 expect(host.textContent).toContain("Данные получены: 0");
 expect(f).toHaveBeenCalledTimes(3);
});

it("logical same trainer with cloned actor and reader does not repeat GET",async()=>{
 const f=vi.fn(async()=>ok([booking()]));
 await mount(f,actor,()=>session);
 expect(host.textContent).toContain("Запись booking-a");
 await mount(f,{...actor},()=>session);
 expect(host.textContent).toContain("Запись booking-a");
 expect(f).toHaveBeenCalledTimes(1);
});
