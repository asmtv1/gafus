// @vitest-environment jsdom
/** AG4 source-only action privacy on principal retirement; no real network. */
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {TrainerBookingTransitionAction} from "./TrainerBookingTransitionAction";
import type {PanelActor} from "./consultationContract";
const actor:PanelActor={id:"trainer-a",role:"TRAINER"};
const A={actor,token:"synthetic-token",authEpoch:"generation-a"};
type Session={actor:PanelActor;token:string|null;authEpoch?:string};
const booking=(status="PENDING_TRAINER_CONFIRMATION")=>({
 id:"booking-a",status,cynologistUserId:"trainer-a",
 slot:{id:"slot-a",startAtUtc:"2026-11-01T10:00:00Z",endAtUtc:"2026-11-01T10:30:00Z"},
});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(mode:"confirm"|"reject",live:()=>Session|null,
 fetchImpl:typeof fetch,callback=vi.fn()){
 await act(async()=>root.render(createElement(TrainerBookingTransitionAction,{
  mode,booking:booking(),actor,token:A.token,authEpoch:A.authEpoch,
  getCurrentSession:live,fetchImpl,onVerifiedRefresh:callback,
 })));
}
async function click(label:string){
 const btn=[...host.querySelectorAll("button")].find(b=>b.textContent===label);
 expect(btn).toBeDefined();await act(async()=>btn?.click());
}
for(const [label,next] of [
 ["logout",null],
 ["other trainer",{...A,actor:{id:"trainer-b",role:"TRAINER" as const}}],
 ["role downgrade",{...A,actor:{id:"trainer-a",role:"USER" as const}}],
 ["epoch rotation",{...A,authEpoch:"generation-b"}],
 ["ABA epoch rotation",{...A,authEpoch:"generation-c"}],
] as const){
 it(`reject form and typed reason disappear on rerender after ${label}`,async()=>{
  let current:Session|null=A;const live=()=>current;
  const f=vi.fn();await mount("reject",live,f as typeof fetch);
  await click("Отклонить заявку");
  expect(host.textContent).toContain("booking-a?");
  const input=host.querySelector('textarea[aria-label="Причина отклонения или отмены"]');
  expect(input).not.toBeNull();
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(
    input,"PRIVATE_REASON");
   input?.dispatchEvent(new Event("input",{bubbles:true}));
  });
  current=next;await mount("reject",live,f as typeof fetch);
  expect(host.textContent).not.toContain("PRIVATE_REASON");
  expect(host.textContent).not.toContain("booking-a");
  expect(host.querySelectorAll("button")).toHaveLength(0);
  expect(f).not.toHaveBeenCalled();
 });
}
it("preflight retired session suppresses action and all mutation controls",async()=>{
 const f=vi.fn();await mount("confirm",()=>null,f as typeof fetch);
 expect(host.querySelectorAll("button")).toHaveLength(0);
 expect(host.textContent).not.toContain("booking-a");
 expect(f).not.toHaveBeenCalled();
});
it("verified trainer can still open confirm dialog without POST",async()=>{
 const f=vi.fn();await mount("confirm",()=>A,f as typeof fetch);
 await click("Подтвердить");
 expect(host.textContent).toContain("Подтвердить запись booking-a?");
 expect(f).not.toHaveBeenCalled();
});
