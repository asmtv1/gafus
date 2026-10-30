// @vitest-environment jsdom
/** AG4 Trainer opt-in availability: read-only manual retry and stale/foreign fencing. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {TrainerOptInRoute} from "./optInRoute";
const actor={id:"trainer-a",role:"TRAINER" as const};
const session={actor,token:"TOKEN",authEpoch:"epoch-a"};
const dto=()=>({slotDurationMin:30,rules:[{weekday:1,startTime:"09:00",
 endTime:"10:00",isWorkingDay:true}],dayOffs:[],exceptions:[]});
const response=(status:number,data:unknown)=>new Response(JSON.stringify(status===200?
 {success:true,data}:{success:false,error:"PRIVATE_SERVER_ERROR"}),{status,
 headers:{"cache-control":"private, no-store"}});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(fetchImpl:typeof fetch,live:()=>typeof session|null=()=>session){
 await act(async()=>root.render(createElement(TrainerOptInRoute,{
  pathname:"/main-panel/consultations/availability",actor,token:session.token,
  authEpoch:session.authEpoch,getCurrentSession:live,fetchImpl,
 })));
}
async function retry(){
 const b=host.querySelector('button[aria-label="Повторить загрузку расписания"]') as HTMLButtonElement;
 expect(b).not.toBeNull();await act(async()=>b.click());
}
for(const status of [401,403,404]){
 it(`GET ${status} error allows exactly one explicit retry, no PUT`,async()=>{
  let n=0;const f=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>
    ++n===1?response(status,{}):response(200,dto()));
  await mount(f);
  expect(host.textContent).toContain("Не удалось загрузить расписание");
  expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
  expect(f).toHaveBeenCalledTimes(1);
  await retry();expect(host.textContent).toContain("Продолжительность слота: 30 мин.");
  expect(f).toHaveBeenCalledTimes(2);
  expect(f.mock.calls.every(c=>c[1]?.method==="GET")).toBe(true);
 });
}
it("invalid calendar in GET fails closed and explicit retry recovers",async()=>{
 let n=0;const f=vi.fn(async()=>response(200,++n===1?{
  ...dto(),dayOffs:[{id:"off-a",date:"2026-02-30",reason:"PRIVATE_REASON"}],
 }:dto()));
 await mount(f);expect(host.textContent).toContain("Не удалось загрузить расписание");
 expect(host.textContent).not.toContain("PRIVATE_REASON");
 await retry();expect(host.textContent).toContain("Выходных дней пока нет");
});
it("logout hides read retry and late response never reveals reason",async()=>{
 let live:typeof session|null=session;let done!:(res:Response)=>void;
 const f=vi.fn(async()=>new Promise<Response>(resolve=>{done=resolve;}));
 await mount(f,()=>live);expect(host.textContent).toContain("Загрузка расписания");
 live=null;await mount(f,()=>live);
 await act(async()=>done(response(200,{...dto(),dayOffs:[{
  id:"off-a",date:"2026-11-03",reason:"PRIVATE_REASON",
 }]})));
 expect(host.textContent).not.toContain("PRIVATE_REASON");
 expect(host.querySelector('button[aria-label="Повторить загрузку расписания"]')).toBeNull();
 expect(f).toHaveBeenCalledTimes(1);
});

it("PUT conflict enters UNKNOWN without exposing GET retry or another mutation",async()=>{
 let writes=0;
 const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="PUT"){writes++;return response(409,{});}
  return response(200,dto());
 });
 await mount(f);
 const save=[...host.querySelectorAll("button")].find(b=>b.textContent==="Сохранить расписание");
 expect(save).toBeDefined();await act(async()=>save?.click());
 expect(host.textContent).toContain("Конфликт при сохранении");
 expect(writes).toBe(1);
 expect(host.querySelector('button[aria-label="Повторить загрузку расписания"]')).toBeNull();
 await act(async()=>save?.click());
 expect(writes).toBe(1);
});

it("recreated same-principal reader preserves unsaved availability clock without GET",async()=>{
 const f=vi.fn(async()=>response(200,dto()));
 await mount(f,()=>session);
 const input=host.querySelector('input[aria-label="Окончание 1"]') as HTMLInputElement;
 expect(input).not.toBeNull();
 await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(input,"12:00");
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
 });
 await mount(f,()=>session);
 expect((host.querySelector('input[aria-label="Окончание 1"]') as HTMLInputElement).value).toBe("12:00");
 expect(f).toHaveBeenCalledTimes(1);
});
