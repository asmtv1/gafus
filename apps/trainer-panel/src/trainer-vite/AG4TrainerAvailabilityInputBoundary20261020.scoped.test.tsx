// @vitest-environment jsdom
/** AG4 mounted availability: first GET must be trusted, reject inconsistent rows. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainerAvailabilityEditor } from "./TrainerAvailabilityEditor";
import type { PanelActor } from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const session={actor,token:"synthetic-token",authEpoch:"generation-a"};
const data=()=>({slotDurationMin:30,rules:[{
 weekday:1,startTime:"09:00",endTime:"12:00",isWorkingDay:true,
}],dayOffs:[{id:"off-a",date:"2026-11-01",reason:"PRIVATE_DAYOFF_A"}],
 exceptions:[{id:"ex-a",startAtUtc:"2026-11-02T12:00:00Z",
  endAtUtc:"2026-11-02T13:00:00Z",reason:null}]});
const ok=(body:unknown)=>new Response(JSON.stringify({success:true,data:body}),{
 status:200,headers:{"cache-control":"private, no-store"},
});
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(fetchImpl:typeof fetch,live:()=>typeof session|null=()=>session){
 await act(async()=>root.render(createElement(TrainerAvailabilityEditor,{
  actor,token:session.token,authEpoch:session.authEpoch,fetchImpl,getCurrentSession:live,
 })));
}
async function save(){const button=[...host.querySelectorAll("button")]
 .find(b=>b.textContent==="Сохранить расписание");
 expect(button).toBeDefined();await act(async()=>button?.click());}
it("revoked session before first effect must not send a Bearer GET",async()=>{
 const f=vi.fn(async()=>ok(data()));await mount(f,()=>null);
 expect(f).not.toHaveBeenCalled();
 expect(host.textContent).not.toContain("PRIVATE_DAYOFF_A");
});
it("zero rules shows an actionable empty weekly intervals state",async()=>{
 const f=vi.fn(async()=>ok({...data(),rules:[]}));await mount(f);
 expect(host.textContent).toContain("Недельных интервалов пока нет");
 expect(host.textContent).toContain("Добавить интервал");
 expect(host.querySelectorAll("fieldset")).toHaveLength(0);
 expect(f).toHaveBeenCalledTimes(1);
});
for(const bad of [
 {...data(),rules:[{...data().rules[0],weekday:9}]},
 {...data(),dayOffs:[data().dayOffs[0],data().dayOffs[0]]},
 {...data(),exceptions:[{...data().exceptions[0],endAtUtc:"2026-11-02T11:00:00Z"}]},
]){
 it("invalid weekly/day-off/exception successful GET is rejected",async()=>{
  const f=vi.fn(async()=>ok(bad));await mount(f);
  expect(host.textContent).toContain("Не удалось загрузить расписание");
  expect(host.textContent).not.toContain("PRIVATE_DAYOFF_A");
  expect(host.querySelectorAll("fieldset")).toHaveLength(0);
 });
}
it("POST acknowledged but duplicate day-off readback remains UNKNOWN",async()=>{
 let reads=0;
 const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="PUT")return ok({});
  reads+=1;return ok(reads===1?data():{...data(),
   dayOffs:[data().dayOffs[0],data().dayOffs[0]]});
 });
 await mount(f);await save();
 expect(f).toHaveBeenCalledTimes(3);
 expect(host.textContent).toContain("Результат сохранения неизвестен");
 expect(host.textContent).not.toContain("Расписание подтверждено сервером");
});
