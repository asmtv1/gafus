// @vitest-environment jsdom
/** AG4 mounted trainer bookings: current principal, owner-bound rows, mutation readback. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConsultationConsumerPreview } from "./ConsultationConsumerPreview";
import type { PanelActor } from "./consultationContract";
const actor: PanelActor = { id: "trainer-a", role: "TRAINER" };
const session = { actor, token: "synthetic-jwt-a", authEpoch: "generation-a" };
const booking = (id="booking-a", status="PENDING_TRAINER_CONFIRMATION", owner=actor.id) => ({
 id,status,cynologistUserId:owner,
 confirmationDeadlineAt:"2026-10-20T08:00:00Z",createdAt:"2026-10-18T09:00:00Z",
 slot:{id:"slot-a",startAtUtc:"2026-10-21T09:00:00Z",endAtUtc:"2026-10-21T09:30:00Z"},
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200,
 headers:{"cache-control":"private, no-store"}});
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(fetchImpl:typeof fetch,live:()=>typeof session|null=()=>session){
 await act(async()=>root.render(createElement(ConsultationConsumerPreview,{
  pathname:"/main-panel/consultations",actor,token:session.token,authEpoch:session.authEpoch,
  getCurrentSession:live,fetchImpl,
 })));
}
async function click(label:string){
 const button=[...host.querySelectorAll("button")].find(b=>b.textContent===label);
 expect(button,`missing ${label}`).toBeDefined();
 await act(async()=>button?.click());
}
it("revoked before mount prevents first authenticated GET",async()=>{
 const f=vi.fn(async()=>ok([booking()]));await mount(f,()=>null);
 expect(f).not.toHaveBeenCalled();
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(0);
 expect(host.textContent).not.toContain("Данные получены");
});
it("preflight revoked session explains denied access instead of implying an empty list",async()=>{
 const f=vi.fn(async()=>ok([]));await mount(f,()=>null);
 expect(f).not.toHaveBeenCalled();
 expect(host.textContent).toContain("Доступ к данным не предоставлен");
});
it("loaded bookings disappear on rerender after principal is revoked",async()=>{
 let live:typeof session|null=session;
 const reader=()=>live;
 const f=vi.fn(async()=>ok([booking()]));
 await mount(f,reader);
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(1);
 live=null;
 await mount(f,reader);
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(0);
 expect(host.textContent).toContain("Доступ к данным не предоставлен");
 expect(f).toHaveBeenCalledTimes(1);
});
it("empty owner-bound list produces useful empty state",async()=>{
 const f=vi.fn(async()=>ok([]));await mount(f);
 expect(host.textContent).toContain("Записей пока нет");
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(0);
 expect(f).toHaveBeenCalledTimes(1);
});
for(const payload of [
 [booking("booking-a"),booking("booking-a")],
 [booking("booking-a","CONFIRMED","other-trainer")],
 [{...booking(),slot:{...booking().slot,startAtUtc:"invalid-date"}}],
]){
 it("invalid, duplicate or foreign successful GET is rejected as a whole",async()=>{
  const f=vi.fn(async()=>ok(payload));await mount(f);
  expect(host.textContent).toContain("Не удалось получить данные");
  expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(0);
  expect(f).toHaveBeenCalledTimes(1);
 });
}
it("duplicate booking during confirmed readback is UNKNOWN, not published",async()=>{
 let reads=0;
 const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="POST")return ok({bookingId:"booking-a"});
  reads+=1;
  return ok(reads===1?[booking()]:[booking("booking-a","CONFIRMED"),booking("booking-a","CONFIRMED")]);
 });
 await mount(f);await click("Подтвердить");await click("Да, подтвердить");
 expect(f).toHaveBeenCalledTimes(3);
 expect(host.textContent).toContain("Результат подтверждения неизвестен");
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(1);
 expect(host.textContent).not.toContain("Подтверждение проверено по списку");
});
it("stale response body after epoch rotation cannot publish bookings",async()=>{
 let live:typeof session|null=session;let release!:(body:string)=>void;
 const f=vi.fn(async()=>({status:200,headers:new Headers({"cache-control":"private, no-store"}),
  text:()=>new Promise<string>(resolve=>{release=resolve;})}) as Response);
 await mount(f,()=>live);live={...session,authEpoch:"generation-b"};
 await act(async()=>release(JSON.stringify({success:true,data:[booking()]})));
 expect(host.querySelectorAll("[data-booking-id]")).toHaveLength(0);
 expect(host.textContent).not.toContain("Данные получены");
});
