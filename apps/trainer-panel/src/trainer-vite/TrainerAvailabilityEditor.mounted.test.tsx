// @vitest-environment jsdom
import {act} from "react";
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import type {Root} from "react-dom/client";
import {mountTrainerEntry} from "./mountTrainerEntry";
import type {PanelActor} from "./consultationContract";
const actor:PanelActor={id:"trainer-A",role:"TRAINER"};
const session={actor,token:"synthetic-jwt",authEpoch:"E1"};
type Session={actor:PanelActor;token:string|null;authEpoch?:string};
const original=()=>({
 slotDurationMin:30,
 rules:[{id:"rule-1",weekday:1,startTime:"09:00",endTime:"12:00",isWorkingDay:true}],
 dayOffs:[{id:"off-1",date:"2026-10-21",reason:"Отпуск"}],
 exceptions:[{id:"ex-1",startAtUtc:"2026-10-22T12:00:00Z",
  endAtUtc:"2026-10-22T13:00:00Z",reason:"Личное дело"}]
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),
 {status:200,headers:{"cache-control":"private, no-store"}});
let el:HTMLDivElement,root:Root|null;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 el=document.createElement("div");document.body.append(el);root=null;
});
afterEach(async()=>{if(root)await act(async()=>root?.unmount());el.remove();});
async function mount(fetchImpl:typeof fetch,reader?:()=>Session|null,who:PanelActor=actor){
 await act(async()=>{root=mountTrainerEntry(el,{
  pathname:"/main-panel/consultations/availability",
  actor:who,token:session.token,authEpoch:"E1",
  fetchImpl,getCurrentSession:reader
 });});
}
async function click(text:string){
 const b=[...el.querySelectorAll("button")].find(x=>x.textContent?.trim()===text);
 expect(b,"missing "+text).toBeDefined();
 await act(async()=>b?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
}
async function changeTime(name:string,value:string){
 const e=el.querySelector('input[aria-label="'+name+'"]');
 expect(e).not.toBeNull();
 await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(e,value);
  e?.dispatchEvent(new Event("input",{bubbles:true}));
  e?.dispatchEvent(new Event("change",{bubbles:true}));
 });
}
describe("real opt-in Trainer weekly availability / typed GET PUT readback",()=>{
 it("loads actual rules, read-only day-offs/exceptions once",async()=>{
  const f=vi.fn(async()=>ok(original()));
  await mount(f);
  expect(el.textContent).toContain("Продолжительность слота: 30 мин.");
  expect(el.textContent).toContain("Отпуск");
  expect(el.textContent).toContain("Личное дело");
  expect(el.querySelectorAll("fieldset")).toHaveLength(1);
  expect(f).toHaveBeenCalledTimes(1);
  const calls=f.mock.calls as unknown as [string,RequestInit][];
  expect(calls[0]?.[0]).toBe("/api/v1/consultations/trainer/availability");
  expect(calls[0]?.[1]?.method).toBe("GET");
 });
 it("changes time through actual entry, one PUT, verifies GET before saved",async()=>{
  let changed=false,postCalls=0,getCalls=0;
  const f=vi.fn(async(_path:RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==="PUT"){
    postCalls++;
    expect(JSON.parse(String(init.body))).toEqual({rules:[{
      weekday:1,startTime:"09:00",endTime:"13:30",isWorkingDay:true
    }]});
    changed=true;return ok({});
   }
   getCalls++;
   return ok({...original(),rules:[{...original().rules[0],
     endTime:changed?"13:30":"12:00"}]});
  });
  await mount(f);await changeTime("Окончание 1","13:30");
  await click("Сохранить расписание");
  expect(postCalls).toBe(1);expect(getCalls).toBe(2);
  expect(el.textContent).toContain("Расписание подтверждено сервером");
 });
 it("invalid reversed interval never sends PUT",async()=>{
  const f=vi.fn(async()=>ok(original()));
  await mount(f);await changeTime("Окончание 1","08:00");
  await click("Сохранить расписание");
  expect(f).toHaveBeenCalledTimes(1);
  expect(el.querySelector('[role="alert"]')?.textContent).toContain("Проверьте время");
 });
 it("ACK then mismatching server GET is unknown, PUT is never repeated",async()=>{
  let postCount=0;
  const f=vi.fn(async(_path:RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==="PUT"){postCount++;return ok({});}
   return ok(original());
  });
  await mount(f);await changeTime("Окончание 1","13:30");
  await click("Сохранить расписание");
  expect(postCount).toBe(1);expect(f).toHaveBeenCalledTimes(3);
  expect(el.querySelector('[role="alert"]')?.textContent).toContain("неизвестен");
  await click("Сохранить расписание");
  expect(postCount).toBe(1);
 });
 it("lost ACK does not imply failed write; no automatic PUT retry",async()=>{
  let writes=0;
  const f=vi.fn(async(_path:RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==="PUT"){writes++;throw Error("lost ack");}
   return ok(original());
  });
  await mount(f);await click("Сохранить расписание");
  expect(writes).toBe(1);
  expect(el.querySelector('[role="alert"]')?.textContent).toContain("неизвестен");
 });
 it("double tap while PUT pending stays a single request",async()=>{
  let ack!:(res:Response)=>void;
  let calls=0;
  const f=vi.fn((_path:RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==="PUT"){calls++;return new Promise<Response>(r=>{ack=r;});}
   return Promise.resolve(ok(original()));
  });
  await mount(f);await click("Сохранить расписание");
  await click("Сохранить расписание");
  expect(calls).toBe(1);
  await act(async()=>ack(ok({})));
  expect(el.textContent).toContain("Расписание подтверждено сервером");
 });
 for(const [name,next] of [
  ["logout",null],
  ["owner",{actor:{id:"trainer-B",role:"TRAINER"},token:"other",authEpoch:"E2"}],
  ["role",{actor:{id:"trainer-A",role:"USER"},token:"synthetic-jwt",authEpoch:"E1"}],
  ["epoch",{actor,token:"synthetic-jwt",authEpoch:"E2"}]
 ] as const){
  it("late PUT "+name+" without render cannot GET or confirm",async()=>{
   let live:Session|null=session;let finish!:(r:Response)=>void,reads=0,writes=0;
   const f=vi.fn((_path:RequestInfo|URL,init?:RequestInit)=>{
    if(init?.method==="PUT"){writes++;
      return new Promise<Response>(r=>{finish=r;});
    }
    reads++;return Promise.resolve(ok(original()));
   });
   await mount(f,()=>live);await click("Сохранить расписание");
   live=next as Session|null;
   await act(async()=>finish(ok({})));
   expect(reads).toBe(1);expect(writes).toBe(1);
   expect(el.textContent).not.toContain("Расписание подтверждено сервером");
  });
 }
 it("late GET after logout cannot render rules",async()=>{
  let live:Session|null=session;
  let settle!:(r:Response)=>void;
  const f=vi.fn(()=>new Promise<Response>(r=>{settle=r;}));
  await mount(f,()=>live);
  live=null;
  await act(async()=>settle(ok(original())));
  expect(el.querySelectorAll("fieldset")).toHaveLength(0);
  expect(el.textContent).not.toContain("Отпуск");
 });
 it("MODERATOR and USER never call availability endpoint",async()=>{
  const f=vi.fn(async()=>ok(original()));
  await mount(f,undefined,{id:"moderator-A",role:"MODERATOR"});
  expect(f).not.toHaveBeenCalled();
  expect(el.querySelector('[role="alert"]')?.textContent).toContain("Нет доступа");
 });
});
