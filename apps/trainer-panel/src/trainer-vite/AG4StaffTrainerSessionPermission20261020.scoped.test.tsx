// @vitest-environment jsdom
/** AG4 owner-only, Trainer mounted source-only session characterization. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ConsultationConsumerPreview } from "./ConsultationConsumerPreview";
import type {PanelActor} from "./consultationContract";
const A:PanelActor={id:"trainer-a",role:"TRAINER"};
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200,headers:{"cache-control":"private, no-store"}});
const deny=(status:number)=>new Response(JSON.stringify({success:false,error:"SYNTHETIC_DENIAL"}),{status,headers:{"cache-control":"private, no-store"}});
const foreign={id:"PRIVATE_FOREIGN_BOOKING",status:"CONFIRMED",cynologistUserId:"trainer-b",
 confirmationDeadlineAt:"2026-10-20T11:00:00Z",createdAt:"2026-10-20T08:00:00Z",
 slot:{id:"slot-b",startAtUtc:"2026-10-20T09:00:00Z",endAtUtc:"2026-10-20T10:00:00Z"}};
type Current={actor:PanelActor;token:string|null;authEpoch?:string}|null;
const origin:Current={actor:A,token:"SYNTHETIC_JWT_A",authEpoch:"generation-1"};
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mounted(live:()=>Current,fetchImpl:typeof fetch){
 await act(async()=>root.render(createElement(ConsultationConsumerPreview,{pathname:"/main-panel/consultations",actor:A,token:origin!.token,authEpoch:"generation-1",getCurrentSession:live,fetchImpl})));
}
for(const status of [401,403,404,409]){
 it(`TRAINER bookings ${status} does not publish or retry`,async()=>{
  const fetchImpl=vi.fn(async()=>deny(status));
  await mounted(()=>origin,fetchImpl);
  expect(host.textContent).toContain("Не удалось получить данные");
  expect(host.textContent).not.toContain("Данные получены");
  expect(host.textContent).not.toContain("PRIVATE_FOREIGN_BOOKING");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url,init]=fetchImpl.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("/api/v1/consultations/trainer/bookings");
  expect(init.method).toBe("GET");expect(init.cache).toBe("no-store");
  expect(JSON.stringify(init.headers)).toContain("Bearer SYNTHETIC_JWT_A");
 });
}
for(const [name,next] of [
 ["logout",null],
 ["other owner",{actor:{id:"trainer-b",role:"TRAINER"},token:"SYNTHETIC_JWT_B",authEpoch:"generation-1"}],
 ["downgrade",{actor:{id:"trainer-a",role:"USER"},token:"SYNTHETIC_JWT_A",authEpoch:"generation-1"}],
 ["same owner new generation",{actor:A,token:"SYNTHETIC_JWT_A",authEpoch:"generation-2"}],
 ["ABA restored principal new generation",{actor:A,token:"SYNTHETIC_JWT_A",authEpoch:"generation-3"}],
 ] as const){
 it(`TRAINER ${name}: late success never reaches mounted UI`,async()=>{
  let live:Current=origin;
  let complete!:(v:Response)=>void;
  const fetchImpl=vi.fn((_u:RequestInfo|URL,_i?:RequestInit)=>
   new Promise<Response>(resolve=>{complete=resolve;}));
  await mounted(()=>live,fetchImpl);
  live=next;
  await act(async()=>complete(ok([])));
  expect(host.textContent).not.toContain("Данные получены");
  expect(host.querySelector("[data-booking-id]")).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
}
it("TRAINER refuses foreign owner booking returned as HTTP 200",async()=>{
 const fetchImpl=vi.fn(async()=>ok([foreign]));
 await mounted(()=>origin,fetchImpl);
 expect(host.textContent).toContain("Не удалось получить данные");
 expect(host.textContent).not.toContain("PRIVATE_FOREIGN_BOOKING");
 expect(fetchImpl).toHaveBeenCalledTimes(1);
});
