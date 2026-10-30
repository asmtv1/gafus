// @vitest-environment jsdom
/** AG4 timezone-safe consultation reads & write confirmation, synthetic transport. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifiedBookings } from "./verifiedTrainerBookings";
import { ConsultationConsumerPreview } from "./ConsultationConsumerPreview";
import type { PanelActor } from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const session={actor,token:"synthetic",authEpoch:"generation-a"};
const booking=(status="PENDING_TRAINER_CONFIRMATION",start="2026-11-04T09:00:00Z")=>({
 id:"booking-a",status,cynologistUserId:"trainer-a",
 confirmationDeadlineAt:"2026-11-04T08:00:00Z",createdAt:"2026-11-01T09:00:00Z",
 slot:{id:"slot-a",startAtUtc:start,endAtUtc:"2026-11-04T09:30:00Z"},
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{
 status:200,headers:{"cache-control":"private, no-store"}});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(fetchImpl:typeof fetch){
 await act(async()=>root.render(createElement(ConsultationConsumerPreview,{
  pathname:"/main-panel/consultations",actor,token:session.token,authEpoch:session.authEpoch,
  getCurrentSession:()=>session,fetchImpl,
 })));
}
async function click(label:string){
 const button=[...host.querySelectorAll("button")].find(b=>b.textContent===label);
 expect(button).toBeDefined();await act(async()=>button?.click());
}
it("timezone-free ISO timestamps are not valid staff booking DTOs",()=>{
 expect(verifiedBookings([booking("CONFIRMED","2026-11-04T09:00:00")],actor)).toBe(false);
 expect(verifiedBookings([booking("CONFIRMED","2026-11-04T09:00:00Z")],actor)).toBe(true);
 expect(verifiedBookings([booking("CONFIRMED","2026-11-04T12:00:00+03:00")],actor)).toBe(true);
});
it("calendar-overflow timestamps must be rejected instead of normalized silently",()=>{
 expect(verifiedBookings([booking("CONFIRMED","2026-02-30T09:00:00Z")],actor)).toBe(false);
});
it("trainer initial GET rejects timezone-free slot without publishing record",async()=>{
 const f=vi.fn(async()=>ok([booking("CONFIRMED","2026-11-04T09:00:00")]));
 await mount(f);
 expect(host.textContent).toContain("Не удалось получить данные");
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(0);
 expect(f).toHaveBeenCalledTimes(1);
});
it("trainer POST readback with timezone-free slot must remain UNKNOWN",async()=>{
 let reads=0;
 const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="POST")return ok({bookingId:"booking-a"});
  ++reads;
  return ok([reads===1?booking():booking("CONFIRMED","2026-11-04T09:00:00")]);
 });
 await mount(f);await click("Подтвердить");await click("Да, подтвердить");
 expect(f).toHaveBeenCalledTimes(3);
 expect(host.textContent).toContain("Результат подтверждения неизвестен");
 expect(host.textContent).not.toContain("Подтверждение проверено по списку");
});
