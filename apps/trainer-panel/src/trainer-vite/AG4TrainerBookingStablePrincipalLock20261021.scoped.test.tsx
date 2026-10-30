// @vitest-environment jsdom
/** AG4 same-principal props refresh cannot silently reset unknown booking operation. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {ConsultationConsumerPreview} from "./ConsultationConsumerPreview";
import type {PanelActor} from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const session={actor,token:"synthetic",authEpoch:"epoch-a"};
const booking=()=>({id:"booking-a",status:"PENDING_TRAINER_CONFIRMATION",
 cynologistUserId:"trainer-a",confirmationDeadlineAt:"2026-11-01T00:00:00Z",
 createdAt:"2026-10-18T09:00:00Z",slot:{id:"slot-a",
 startAtUtc:"2026-11-04T09:00:00Z",endAtUtc:"2026-11-04T09:30:00Z"}});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{
 status:200,headers:{"cache-control":"private, no-store"}});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const reader=()=>session;
async function mount(fetchImpl:typeof fetch,actingAs:PanelActor){
 await act(async()=>root.render(createElement(ConsultationConsumerPreview,{
  pathname:"/main-panel/consultations",actor:actingAs,
  token:session.token,authEpoch:session.authEpoch,
  getCurrentSession:reader,fetchImpl,
 })));
}
async function click(label:string){const b=[...host.querySelectorAll("button")].find(x=>x.textContent===label);
 expect(b,`Missing ${label}`).toBeDefined();await act(async()=>b?.click());}
for(const [label,post] of [
 ["lost ACK",async()=>{throw Error("LOST_ACK");}],
 ["403",async()=>new Response(JSON.stringify({success:false,code:"FORBIDDEN"}),{
  status:403,headers:{"cache-control":"private, no-store"}})],
] as const){
 it(`${label}: same actor re-render never unlocks competing mutation`,async()=>{
  const fetchImpl=vi.fn(async(_u:RequestInfo|URL,i?:RequestInit)=>{
   if(i?.method==="POST")return post();
   return ok([booking()]);
  });
  await mount(fetchImpl,actor);
  await click("Подтвердить");await click("Да, подтвердить");
  expect(fetchImpl.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(1);
  await mount(fetchImpl,{...actor});
  await click("Отклонить заявку");await click("Да, отклонить");
  expect(fetchImpl.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(1);
  expect(host.textContent).toContain("Для этой записи уже выполняется действие");
 });
}
