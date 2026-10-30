// @vitest-environment jsdom
/** AG4 Trainer PUT cannot declare success when other availability data drifted. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {TrainerAvailabilityEditor} from "./TrainerAvailabilityEditor";
import type {PanelActor} from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const session={actor,token:"synthetic",authEpoch:"epoch-a"};
const data=()=>({slotDurationMin:30,rules:[{weekday:1,startTime:"09:00",endTime:"10:00",isWorkingDay:true}],
 dayOffs:[{id:"off-a",date:"2026-11-03",reason:"PRIVATE_DAYOFF"}],
 exceptions:[{id:"ex-a",startAtUtc:"2026-11-04T09:00:00Z",endAtUtc:"2026-11-04T10:00:00Z",reason:"PRIVATE_EX"}]});
const ok=(d:unknown)=>new Response(JSON.stringify({success:true,data:d}),{status:200,headers:{"cache-control":"private, no-store"}});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function run(readback:ReturnType<typeof data>){
 let reads=0;
 const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="PUT")return ok({});
  return ok(++reads===1?data():readback);
 });
 await act(async()=>root.render(createElement(TrainerAvailabilityEditor,{
  actor,token:session.token,authEpoch:session.authEpoch,getCurrentSession:()=>session,fetchImpl:f,
 })));
 const btn=[...host.querySelectorAll("button")].find(b=>b.textContent==="Сохранить расписание");
 expect(btn).toBeDefined();await act(async()=>btn?.click());
 expect(f).toHaveBeenCalledTimes(3);
 expect(f.mock.calls.filter(c=>c[1]?.method==="PUT")).toHaveLength(1);
}
for(const changed of [
 {...data(),dayOffs:[]},{...data(),exceptions:[]},{...data(),slotDurationMin:45}]){
 it("collateral data drift after PUT stays UNKNOWN",async()=>{
  await run(changed);
  expect(host.textContent).toContain("Результат сохранения неизвестен");
  expect(host.textContent).not.toContain("Расписание подтверждено сервером");
 });
}
it("unchanged collateral settings allow verified PUT",async()=>{
 await run(data());expect(host.textContent).toContain("Расписание подтверждено сервером");
});
