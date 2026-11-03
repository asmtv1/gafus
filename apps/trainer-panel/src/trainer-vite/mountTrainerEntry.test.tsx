// @vitest-environment jsdom
import {act} from "react";
import type {Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {mountTrainerEntry} from "./mountTrainerEntry";
let mount:HTMLDivElement;let root:Root|null;
const accepted=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200,headers:{"cache-control":"private, no-store"}});
const booking=(owner="trainer-A")=>({
 id:"booking-1",status:"PENDING_TRAINER_CONFIRMATION",cynologistUserId:owner,confirmationDeadlineAt:"2026-10-20T08:00:00.000Z",
 createdAt:"2026-10-17T10:00:00.000Z",
 slot:{id:"slot-1",startAtUtc:"2026-10-20T09:00:00.000Z",endAtUtc:"2026-10-20T10:00:00.000Z"}
});
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});mount=document.createElement("div");document.body.append(mount);root=null;});
afterEach(async()=>{if(root)await act(async()=>root?.unmount());mount.remove();});
describe("Trainer opt-in entry → Hono booking consumer → user-visible list",()=>{
 it("TRAINER renders own booking with time and status on /main-panel/consultations",async()=>{
  const f=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>accepted([booking()]));
  await act(async()=>{root=mountTrainerEntry(mount,{pathname:"/main-panel/consultations",actor:{role:"TRAINER",id:"trainer-A"},token:"signed-synthetic",fetchImpl:f});});
  expect(f).toHaveBeenCalledTimes(1);
  expect(f.mock.calls[0]?.[0]).toBe("/api/v1/consultations/trainer/bookings");
  expect(mount.querySelector('ul[aria-label="Список консультаций"] li')?.textContent).toContain("booking-1");
  expect(mount.textContent).toContain("2026-10-20 09:00 UTC");
  expect(mount.textContent).toContain("PENDING_TRAINER_CONFIRMATION");
  expect(mount.textContent).toContain("Данные получены: 1");
 });
 it("restores Next-style client and pet intake behind a collapsible detail panel",async()=>{
  const f=vi.fn(async()=>accepted([{
    ...booking(), clientUsername:"sobakovod",clientOwnerName:"Клиент Иван",
    clientPhone:"+79990000000",petName:"Рекс",petBreed:"Терьер",
    petAge:"2 года",petGender:"MALE",clientProblem:"Боится поводка",
    clientSelfHelpAttempt:"Использовал лакомства",
  }]));
  await act(async()=>{root=mountTrainerEntry(mount,{pathname:"/main-panel/consultations",
    actor:{role:"TRAINER",id:"trainer-A"},token:"signed-synthetic",fetchImpl:f});});
  expect(mount.textContent).toContain("@sobakovod");
  expect(mount.textContent).toContain("Питомец: Рекс · Терьер");
  const intake=mount.querySelector<HTMLDetailsElement>(".trainer-workspace-intake");
  expect(intake).not.toBeNull();
  expect(intake?.open).toBe(false);
  expect(intake?.textContent).toContain("Клиент Иван");
  expect(intake?.textContent).toContain("Боится поводка");
  expect(intake?.textContent).toContain("+79990000000");
  await act(async()=>{
    const el=mount.querySelector<HTMLInputElement>('input[type="search"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(
      el,"терьер поводка");
    el.dispatchEvent(new Event("input",{bubbles:true}));
  });
  expect(mount.querySelectorAll(".trainer-workspace-booking")).toHaveLength(1);
  expect(f).toHaveBeenCalledTimes(1);
 });
 it("an empty owner list is an actionable, non-misleading empty UI",async()=>{
  const f=vi.fn(async()=>accepted([]));
  await act(async()=>{root=mountTrainerEntry(mount,{pathname:"/main-panel/consultations",actor:{role:"TRAINER",id:"trainer-A"},token:"signed-synthetic",fetchImpl:f});});
  expect(mount.textContent).toContain("Записей пока нет");
  expect(mount.querySelector("ul")).toBeNull();
 });
 it("foreign-booking data fails closed without leaking booking details",async()=>{
  const f=vi.fn(async()=>accepted([booking("trainer-B")]));
  await act(async()=>{root=mountTrainerEntry(mount,{pathname:"/main-panel/consultations",actor:{role:"TRAINER",id:"trainer-A"},token:"signed-synthetic",fetchImpl:f});});
  expect(mount.querySelector('[role="alert"]')?.textContent).toContain("Не удалось");
  expect(mount.textContent).not.toContain("booking-1");
 });
 it("MODERATOR does not issue an authenticated request",async()=>{
  const f=vi.fn(async()=>accepted([booking()]));
  await act(async()=>{root=mountTrainerEntry(mount,{pathname:"/main-panel/consultations",actor:{role:"MODERATOR",id:"trainer-A"},token:"other",fetchImpl:f});});
  expect(f).not.toHaveBeenCalled();
  expect(mount.textContent).toContain("Доступ к данным не предоставлен");
 });
});
