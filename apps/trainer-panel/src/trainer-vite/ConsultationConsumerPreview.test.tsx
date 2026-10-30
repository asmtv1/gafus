// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationConsumerPreview } from "./ConsultationConsumerPreview";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host=document.createElement("div");document.body.append(host);root=createRoot(host); });
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(role:"TRAINER"|"MODERATOR"|"USER", fetchImpl:typeof fetch,token:string|null="token",path="/main-panel/consultations",id="trainer-A") {
  await act(async()=>{root.render(createElement(ConsultationConsumerPreview,{pathname:path,actor:{role,id},token,fetchImpl}));});
}
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200,headers:{"cache-control":"private, no-store"}});
describe("AG4 typed consumer preview mounted only, no live route",()=>{
 it("TRAINER loads Hono empty bookings envelope once",async()=>{
  const f=vi.fn(async()=>ok([]));
  await mount("TRAINER",f);expect(host.textContent).toContain("Данные получены: 0");
  expect(f).toHaveBeenCalledTimes(1);
  expect((f.mock.calls as unknown as [string, RequestInit][])[0][0]).toBe("/api/v1/consultations/trainer/bookings");
 });
 it("MODERATOR and missing token do not invoke fetch",async()=>{
  const f=vi.fn(async()=>ok([]));
  await mount("MODERATOR",f);expect(host.textContent).toContain("Доступ");
  await mount("TRAINER",f,null);expect(f).not.toHaveBeenCalled();
 });

 it("shows call link only for OWN confirmed booking inside 15m-before to 60m-after window",async()=>{
  const now=Date.now();
  const booked=(status:string,start:number,end:number)=>({
    id:"test-booking_123",status,cynologistUserId:"trainer-A",
    slot:{id:"slot-b",startAtUtc:new Date(start).toISOString(),
      endAtUtc:new Date(end).toISOString(),status:"BOOKED"},
    confirmationDeadlineAt:new Date(now+60_000).toISOString(),
    createdAt:new Date(now-20_000).toISOString(),
  });
  const start=now+10*60_000,end=now+40*60_000;
  await mount("TRAINER",vi.fn(async()=>ok([booked("CONFIRMED",start,end)])));
  expect(host.querySelector('a[aria-label="Войти в видеоконсультацию"]')?.getAttribute("href"))
    .toBe("/main-panel/consultations/call/test-booking_123");
  await mount("TRAINER",vi.fn(async()=>ok([booked("PENDING_TRAINER_CONFIRMATION",start,end)])));
  expect(host.querySelector('a[aria-label="Войти в видеоконсультацию"]')).toBeNull();
  await mount("TRAINER",vi.fn(async()=>ok([booked("CONFIRMED",now+16*60_000,end)])));
  expect(host.querySelector('a[aria-label="Войти в видеоконсультацию"]')).toBeNull();
 });

 it("shows loading while request is unresolved",async()=>{
  const f=vi.fn(()=>new Promise<Response>(()=>{})) as unknown as typeof fetch;
  await mount("TRAINER",f);expect(host.textContent).toContain("Загрузка консультаций");
 });
 it("nonjson failure shows safe alert rather than stale data",async()=>{
  const f=vi.fn(async()=>new Response("not json",{status:500,headers:{"cache-control":"private, no-store"}}));
  await mount("TRAINER",f);expect(host.querySelector('[role="alert"]')?.textContent).toContain("Не удалось");
 });
 it("route change makes old pending response unable to paint another page",async()=>{
  let settle!: (value:Response)=>void;
  const f=vi.fn(()=>new Promise<Response>(resolve=>{settle=resolve;})) as unknown as typeof fetch;
  await mount("TRAINER",f);
  await mount("TRAINER",f,"token","/main-panel/steps");
  await act(async()=>settle(ok([])));
  expect(host.textContent).toContain("Маршрут не подключён");
  expect(host.textContent).not.toContain("Данные получены");
 });
});
