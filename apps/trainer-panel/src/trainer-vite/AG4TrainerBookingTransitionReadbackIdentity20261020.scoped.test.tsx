// @vitest-environment jsdom
/** AG4 booking mutation receipt cannot bypass unique owner-bound readback validation. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainerBookingTransitionAction } from "./TrainerBookingTransitionAction";
import type { PanelActor } from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const booking=(status="PENDING_TRAINER_CONFIRMATION")=>({
 id:"booking-a",status,cynologistUserId:actor.id,
 confirmationDeadlineAt:"2026-10-20T08:00:00Z",createdAt:"2026-10-18T09:00:00Z",
 slot:{id:"slot-a",startAtUtc:"2026-10-21T09:00:00Z",endAtUtc:"2026-10-21T09:30:00Z"},
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200,
 headers:{"cache-control":"private, no-store"}});
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(readback:unknown,callback=vi.fn()){
 const fetchImpl=vi.fn(async(url:RequestInfo|URL)=>
  String(url).endsWith("/confirm")?ok({bookingId:"booking-a"}):ok(readback));
 await act(async()=>root.render(createElement(TrainerBookingTransitionAction,{
  mode:"confirm",booking:booking(),actor,token:"synthetic-jwt",authEpoch:"generation-a",
  fetchImpl,onVerifiedRefresh:callback,
 })));
 const click=async(label:string)=>{
  const button=[...host.querySelectorAll("button")].find(b=>b.textContent===label);
  expect(button).toBeDefined();await act(async()=>button?.click());
 };
 await click("Подтвердить");await click("Да, подтвердить");
 return {fetchImpl,callback};
}
it("two identical IDs after 200 confirmation are UNKNOWN and never published",async()=>{
 const {fetchImpl,callback}=await mount([booking("CONFIRMED"),booking("CONFIRMED")]);
 expect(fetchImpl).toHaveBeenCalledTimes(2);
 expect(host.textContent).toContain("Результат подтверждения неизвестен");
 expect(host.textContent).not.toContain("Подтверждение проверено по списку");
 expect(callback).not.toHaveBeenCalled();
});
it("invalid slot interval after 200 confirmation is UNKNOWN",async()=>{
 const bad={...booking("CONFIRMED"),slot:{...booking().slot,startAtUtc:"invalid"}};
 const {callback}=await mount([bad]);
 expect(host.textContent).toContain("Результат подтверждения неизвестен");
 expect(callback).not.toHaveBeenCalled();
});
