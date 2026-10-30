// @vitest-environment jsdom
import {act} from "react";
import type {Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {mountTrainerEntry} from "./mountTrainerEntry";
import type {PanelActor} from "./consultationContract";

const actor:PanelActor={id:"trainer-A",role:"TRAINER"};
const token="local-signed-test-token",authEpoch="E1";
const pending=(status="PENDING_TRAINER_CONFIRMATION",cyno="trainer-A",reason:string|null=null,slotStatus="BOOKED")=>({
 id:"booking-1",status,cynologistUserId:cyno,cancelReason:reason,
 createdAt:"2026-10-17T10:00:00Z",confirmationDeadlineAt:"2026-10-18T10:00:00Z",
 slot:{id:"slot-1",startAtUtc:"2026-10-20T09:00:00Z",endAtUtc:"2026-10-20T10:00:00Z",status:slotStatus},
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{
 status:200,headers:{"cache-control":"private, no-store"}
});
let el:HTMLDivElement,root:Root|null;
const current={actor,token,authEpoch};
type Session={actor:PanelActor;token:string|null;authEpoch?:string};
async function mountWith(fetchImpl:typeof fetch,getCurrentSession?:()=>Session|null,
  testActor:PanelActor=actor){
 await act(async()=>{root=mountTrainerEntry(el,{
  pathname:"/main-panel/consultations",actor:testActor,token,authEpoch,fetchImpl,getCurrentSession
 });});
}
async function click(label:string){
 const b=Array.from(el.querySelectorAll("button")).find(x=>x.textContent?.trim()===label);
 expect(b,"button "+label).toBeDefined();
 await act(async()=>b?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
}
async function typeReason(text:string){
 const textarea=el.querySelector("textarea");
 expect(textarea).not.toBeNull();
 await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set;
  setter?.call(textarea,text);
  textarea?.dispatchEvent(new Event("input",{bubbles:true}));
  textarea?.dispatchEvent(new Event("change",{bubbles:true}));
 });
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 el=document.createElement("div");document.body.append(el);root=null;
});
afterEach(async()=>{if(root)await act(async()=>root?.unmount());el.remove();});
describe("Actual Trainer opt-in entry -> reject/cancel -> typed POST and server readback",()=>{
 it("PENDING action is reject; reason optional; one POST then FREE slot + CANCELLED_BY_TRAINER readback",async()=>{
  let posts=0;
  const f=vi.fn(async(path:RequestInfo|URL,init?:RequestInit)=>{
   if(String(path).endsWith("/reject")){
    posts++;expect(init?.method).toBe("POST");expect(JSON.parse(String(init?.body))).toEqual({reason:""});
    return ok({bookingId:"booking-1"});
   }
   return ok([pending(posts?"CANCELLED_BY_TRAINER":"PENDING_TRAINER_CONFIRMATION",
     "trainer-A",null,posts?"FREE":"BOOKED")]);
  });
  await mountWith(f);await click("Отклонить заявку");
  expect(el.textContent).toContain("клиент получит уведомление");
  expect(el.textContent).toContain("Причина (необязательно)");
  expect(el.querySelector("textarea")?.maxLength).toBe(500);
  expect(posts).toBe(0);
  await click("Да, отклонить");
  expect(posts).toBe(1);expect(f).toHaveBeenCalledTimes(3);
  expect(el.textContent).toContain("CANCELLED_BY_TRAINER");
  expect(el.textContent).not.toContain("Отклонить заявку");
 });
 it("CONFIRMED uses cancel wording, persists optional trimmed reason, readback requires matching value",async()=>{
  let write=false;
  const f=vi.fn(async(path:RequestInfo|URL,init?:RequestInit)=>{
   if(String(path).endsWith("/reject")){
    const body=JSON.parse(String(init?.body)) as {reason:string};
    expect(body.reason).toBe("Не могу провести консультацию");
    write=true;return ok({bookingId:"booking-1"});
   }
   return ok([pending(write?"CANCELLED_BY_TRAINER":"CONFIRMED","trainer-A",
    write?"Не могу провести консультацию":null,write?"FREE":"BOOKED")]);
  });
  await mountWith(f);await click("Отменить встречу");
  await typeReason("  Не могу провести консультацию  ");
  await click("Да, отменить встречу");
  expect(f).toHaveBeenCalledTimes(3);
  expect(el.textContent).toContain("CANCELLED_BY_TRAINER");
 });
 it("user cancellation before approval issues zero POST",async()=>{
  const f=vi.fn(async()=>ok([pending()]));
  await mountWith(f);await click("Отклонить заявку");await click("Отмена");
  expect(f).toHaveBeenCalledTimes(1);
 });
 it("HTTP 403 / ambiguous response never retries or claims cancelled",async()=>{
  const f=vi.fn(async(path:RequestInfo|URL)=>String(path).endsWith("/reject")
   ?new Response("upstream uncertain",{status:502,headers:{"cache-control":"private, no-store"}})
   :ok([pending()]));
  await mountWith(f);await click("Отклонить заявку");await click("Да, отклонить");
  expect(f).toHaveBeenCalledTimes(2);
  expect(el.querySelector('[role="alert"]')?.textContent).toContain("неизвестен");
  expect(el.textContent).not.toContain("CANCELLED_BY_TRAINER");
 });
 it("ACK with cancelled booking but slot still BOOKED does not claim verified success",async()=>{
  let write=false;
  const f=vi.fn(async(path:RequestInfo|URL)=>{
   if(String(path).endsWith("/reject")){write=true;return ok({bookingId:"booking-1"});}
   return ok([pending(write?"CANCELLED_BY_TRAINER":"PENDING_TRAINER_CONFIRMATION")]);
  });
  await mountWith(f);await click("Отклонить заявку");await click("Да, отклонить");
  expect(f).toHaveBeenCalledTimes(3);
  expect(el.querySelector('[role="alert"]')?.textContent).toContain("неизвестен");
 });
 it("foreign owner, moderator and terminal status show no reject action",async()=>{
  for(const [role,owner,status] of [
   ["TRAINER","trainer-B","PENDING_TRAINER_CONFIRMATION"],
   ["TRAINER","trainer-A","COMPLETED"],
   ["TRAINER","trainer-A","NO_SHOW"],
   ["MODERATOR","trainer-A","PENDING_TRAINER_CONFIRMATION"]
  ]){
   const f=vi.fn(async()=>ok([pending(status,owner)]));
   await mountWith(f,undefined,{id:"trainer-A",role:role as PanelActor["role"]});
   expect(el.textContent).not.toContain("Отклонить заявку");
   expect(el.textContent).not.toContain("Отменить встречу");
   await act(async()=>root?.unmount());root=null;
   if(role==="MODERATOR")expect(f).toHaveBeenCalledTimes(0);
  }
 });
 for(const [label,transition] of [
  ["logout",null],
  ["owner",{actor:{id:"trainer-B",role:"TRAINER"},token:"other",authEpoch:"E2"}],
  ["role",{actor:{id:"trainer-A",role:"USER"},token,authEpoch}],
  ["epoch",{actor,token,authEpoch:"E2"}]
 ] as const){
  it("late POST after "+label+" without rerender never triggers GET/success",async()=>{
   let live:Session|null=current;
   let resolve!:(response:Response)=>void;
   const f=vi.fn((url:RequestInfo|URL)=>String(url).endsWith("/reject")
    ?new Promise<Response>(r=>{resolve=r;}):Promise.resolve(ok([pending()])));
   await mountWith(f,()=>live);
   await click("Отклонить заявку");await click("Да, отклонить");
   live=transition as Session|null;
   await act(async()=>resolve(ok({bookingId:"booking-1"})));
   expect(f).toHaveBeenCalledTimes(2);
   expect(el.textContent).not.toContain("CANCELLED_BY_TRAINER");
  });
 }
 it("late GET after epoch change never publishes cancellation",async()=>{
  let live:Session|null=current;
  let resolve!:(response:Response)=>void;
  const f=vi.fn((url:RequestInfo|URL)=>{
   if(String(url).endsWith("/reject"))return Promise.resolve(ok({bookingId:"booking-1"}));
   if(f.mock.calls.length===1)return Promise.resolve(ok([pending()]));
   return new Promise<Response>(r=>{resolve=r;});
  });
  await mountWith(f,()=>live);
  await click("Отклонить заявку");await click("Да, отклонить");
  expect(el.textContent).toContain("Проверяем обновлённый список");
  live={...current,authEpoch:"E2"};
  await act(async()=>resolve(ok([pending("CANCELLED_BY_TRAINER","trainer-A",null,"FREE")])));
  expect(el.textContent).not.toContain("CANCELLED_BY_TRAINER");
 });
});
