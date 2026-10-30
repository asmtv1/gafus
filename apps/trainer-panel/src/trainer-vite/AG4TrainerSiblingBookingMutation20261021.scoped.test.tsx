// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {ConsultationConsumerPreview} from "./ConsultationConsumerPreview";
import type {PanelActor} from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const session={actor,token:"synthetic",authEpoch:"epoch-a"};
const booking=(status="PENDING_TRAINER_CONFIRMATION")=>({id:"booking-a",status,
 cynologistUserId:"trainer-a",confirmationDeadlineAt:"2026-11-01T00:00:00Z",
 createdAt:"2026-10-18T09:00:00Z",slot:{id:"slot-a",
 startAtUtc:"2026-11-04T09:00:00Z",endAtUtc:"2026-11-04T09:30:00Z"}});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200,
 headers:{"cache-control":"private, no-store"}});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(fetchImpl:typeof fetch){await act(async()=>root.render(
 createElement(ConsultationConsumerPreview,{pathname:"/main-panel/consultations",
 actor,token:session.token,authEpoch:session.authEpoch,getCurrentSession:()=>session,fetchImpl})));}
async function click(label:string){const b=[...host.querySelectorAll("button")].find(x=>x.textContent===label);
 expect(b,`Missing ${label}`).toBeDefined();await act(async()=>b?.click());}
async function openBoth(){await click("Подтвердить");await click("Отклонить заявку");}
it("sibling confirm and reject cannot both POST same pending booking",async()=>{
 let release!:(r:Response)=>void;
 const f=vi.fn(async(_u:RequestInfo|URL,i?:RequestInit)=>i?.method==="POST"
  ?new Promise<Response>(done=>{release=done;}):ok([booking()]));
 await mount(f);await openBoth();await click("Да, подтвердить");await click("Да, отклонить");
 expect(f.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(1);
 expect(host.textContent).toContain("Для этой записи уже выполняется действие");
 await act(async()=>release(ok({bookingId:"booking-a"})));
});
it("uncertain confirmation does not allow competing reject POST",async()=>{
 const f=vi.fn(async(_u:RequestInfo|URL,i?:RequestInit)=>{
  if(i?.method==="POST")throw Error("LOST_ACK");return ok([booking()]);});
 await mount(f);await openBoth();await click("Да, подтвердить");await click("Да, отклонить");
 expect(f.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(1);
});

it("verified CONFIRMED readback unlocks later completion through same mounted list",async()=>{
 let reads=0,posts=0;
 const f=vi.fn(async(_u:RequestInfo|URL,i?:RequestInit)=>{
  if(i?.method==="POST"){posts++;return ok({bookingId:"booking-a"});}
  const status=++reads===1?"PENDING_TRAINER_CONFIRMATION":posts===1?"CONFIRMED":"COMPLETED";
  return ok([booking(status)]);
 });
 await mount(f);await click("Подтвердить");await click("Да, подтвердить");
 expect(host.textContent).toContain("CONFIRMED");
 await click("Завершить");await click("Да, завершить");
 expect(f.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(2);
 expect(host.textContent).toContain("COMPLETED");
});
for(const status of [401,403,404,409]){
 it(`HTTP ${status} first POST keeps sibling reject blocked`,async()=>{
  const f=vi.fn(async(_u:RequestInfo|URL,i?:RequestInit)=>i?.method==="POST"
   ?new Response(JSON.stringify({success:false,code:"SECRET_DETAIL"}),{
    status,headers:{"cache-control":"private, no-store"}}):ok([booking()]));
  await mount(f);await openBoth();
  await click("Да, подтвердить");await click("Да, отклонить");
  expect(f.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(1);
  expect(host.textContent).not.toContain("SECRET_DETAIL");
 });
}
it("principal retired while first POST pending cannot initiate sibling POST or publish",async()=>{
 let live:typeof session|null=session;
 let release!:(r:Response)=>void;
 const f=vi.fn(async(_u:RequestInfo|URL,i?:RequestInit)=>i?.method==="POST"
  ?new Promise<Response>(done=>{release=done;}):ok([booking()]));
 await act(async()=>root.render(createElement(ConsultationConsumerPreview,{
  pathname:"/main-panel/consultations",actor,token:session.token,
  authEpoch:session.authEpoch,getCurrentSession:()=>live,fetchImpl:f,
 })));
 await openBoth();await click("Да, подтвердить");
 live=null;
 await act(async()=>root.render(createElement(ConsultationConsumerPreview,{
  pathname:"/main-panel/consultations",actor,token:session.token,
  authEpoch:session.authEpoch,getCurrentSession:()=>live,fetchImpl:f,
 })));
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(0);
 await act(async()=>release(ok({bookingId:"booking-a"})));
 expect(f.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(1);
 expect(host.textContent).not.toContain("Данные получены: 1");
});
