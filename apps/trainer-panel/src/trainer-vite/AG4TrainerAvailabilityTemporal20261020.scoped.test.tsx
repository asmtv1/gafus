// @vitest-environment jsdom
/** AG4 Trainer Availability rejects impossible dates and ambiguous instants. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {TrainerAvailabilityEditor} from "./TrainerAvailabilityEditor";
import type {PanelActor} from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const session={actor,token:"synthetic",authEpoch:"epoch-a"};
const data=()=>({slotDurationMin:30,rules:[{weekday:1,startTime:"09:00",endTime:"10:00",isWorkingDay:true}],
 dayOffs:[{id:"off-a",date:"2026-11-02",reason:"PRIVATE_OFF"}],
 exceptions:[{id:"ex-a",startAtUtc:"2026-11-03T09:00:00Z",endAtUtc:"2026-11-03T10:00:00Z",reason:"PRIVATE_EX"}]});
const ok=(d:unknown)=>new Response(JSON.stringify({success:true,data:d}),{status:200,headers:{"cache-control":"private, no-store"}});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(fetchImpl:typeof fetch){
 await act(async()=>root.render(createElement(TrainerAvailabilityEditor,{
  actor,token:session.token,authEpoch:session.authEpoch,getCurrentSession:()=>session,fetchImpl,
 })));
}
for(const bad of [
 {...data(),dayOffs:[{...data().dayOffs[0],date:"2026-02-30"}]},
 {...data(),exceptions:[{...data().exceptions[0],startAtUtc:"2026-11-03T09:00:00"}]},
 {...data(),exceptions:[{...data().exceptions[0],startAtUtc:"2026-02-30T09:00:00Z"}]},
 {...data(),exceptions:[{...data().exceptions[0],startAtUtc:"2026-11-03T24:00:00Z"}]},
]){
 it("bad GET availability timestamp is rejected as a whole",async()=>{
  const f=vi.fn(async()=>ok(bad));await mount(f);
  expect(f).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Не удалось загрузить расписание");
  expect(host.textContent).not.toContain("PRIVATE_OFF");
  expect(host.textContent).not.toContain("PRIVATE_EX");
 });
}
it("UTC offset exception timestamp remains accepted",async()=>{
 const f=vi.fn(async()=>ok({...data(),exceptions:[{...data().exceptions[0],
  startAtUtc:"2026-11-03T13:00:00+04:00"}]}));
 await mount(f);expect(f).toHaveBeenCalledTimes(1);
 expect(host.textContent).toContain("PRIVATE_OFF");
 expect(host.textContent).not.toContain("Не удалось загрузить расписание");
});
it("PUT acknowledged but malformed UTC readback cannot claim successful save",async()=>{
 let reads=0;
 const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="PUT")return ok({});
  return ok(++reads===1?data():{...data(),exceptions:[{...data().exceptions[0],
   startAtUtc:"2026-11-03T09:00:00"}]});
 });
 await mount(f);
 const button=[...host.querySelectorAll("button")].find(b=>b.textContent==="Сохранить расписание");
 expect(button).toBeDefined();await act(async()=>button?.click());
 expect(f).toHaveBeenCalledTimes(3);
 expect(host.textContent).toContain("Результат сохранения неизвестен");
 expect(host.textContent).not.toContain("Расписание подтверждено сервером");
});
