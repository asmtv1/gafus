// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {consultationPath,consultationLegacySlotsPath,consultationLegacyConfirmPath,
 consultationRouteFromPath,routeForPath,navigate}
  from "../../shared/router/location";
import type {BookingsPage,Catalog,SlotRange,SlotsView}
  from "./consultationReadApi";
import type {BookingSourceMockTransport,BookMockReply}
  from "./bookingSourceMock";
const eligible={canBook:true,reason:null,nextBookingAt:null,message:null} as const;
const trainer={id:"cy_01",userId:"trainer1",username:"trainer_a",
 name:"Кинолог Анна",about:"Работа с поведением",slotDurationMin:45};
const slot={id:"slot_01",startAtUtc:"2026-10-19T08:00:00.000Z",
 endAtUtc:"2026-10-19T08:45:00.000Z",status:"FREE" as const};
const booking={id:"booking_01",status:"PENDING_TRAINER_CONFIRMATION" as const,
 slot:{...slot,status:"BOOKED" as const},cynologistUserId:"trainer1",
 cynologistName:"Кинолог Анна",petName:"Рекс",cancelReason:null};
const catalog=():Catalog=>({items:[trainer],eligibility:eligible});
const slots=():SlotsView=>({items:[slot],eligibility:eligible});
const mine=():BookingsPage=>({items:[booking],nextCursor:null});
const ack=():BookMockReply=>({httpStatus:201,success:true,
 data:{kind:"created",booking:{id:"booking_01",
  status:"PENDING_TRAINER_CONFIRMATION",slot,
  cynologistUserId:"trainer1",clientUsername:"ownerA"}}});
const hold=<T,>()=>{let resolve!:(value:T)=>void;
 const promise=new Promise<T>(accept=>{resolve=accept;});
 return {promise,resolve};};
let node:HTMLDivElement,root:Root,cache:QueryClient,fetcher:ReturnType<typeof vi.fn>;
let specialists:ReturnType<typeof vi.fn<()=>Promise<Catalog>>>;
let getSlots:ReturnType<typeof vi.fn<(id:string,range:SlotRange)=>Promise<SlotsView>>>;
let getMine:ReturnType<typeof vi.fn<(username:string,cursor:string|null)=>Promise<BookingsPage>>>;
let verify:ReturnType<typeof vi.fn<BookingSourceMockTransport["verifySlot"]>>;
let submit:ReturnType<typeof vi.fn<BookingSourceMockTransport["submitBooking"]>>;
let readback:ReturnType<typeof vi.fn<BookingSourceMockTransport["readbackMy"]>>;
let fixture:BookingSourceMockTransport;
// Warm only modules exercised by this synthetic App test; production stays lazy.
beforeAll(async()=>{await Promise.all([
 import("./ConsultationOptInHarness"),
 import("./ConsultationsLivePage"),
 import("../profile/ProfileOverview"),
]);});
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(done=>setTimeout(done,100));});
}};
async function mount(path="/profile",enabled=true,withBooking=true){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showConsultationsFlowOptIn={enabled}
   consultationsLoaders={{specialists,slots:getSlots,mine:getMine}}
   consultationsNow={new Date("2026-10-18T05:00:00.000Z")}
   consultationsBookingMockTransport={withBooking?fixture:undefined}/>
 </QueryClientProvider>));await tick();
}
async function link(href:string){
 const a=node.querySelector<HTMLAnchorElement>('a[href="'+href+'"]');
 expect(a,href).not.toBeNull();
 await act(async()=>a?.dispatchEvent(new MouseEvent("click",
  {bubbles:true,cancelable:true,button:0})));await tick();
}
async function click(text:string){
 const b=[...node.querySelectorAll<HTMLButtonElement>("button")]
  .find(x=>x.textContent?.trim()===text);
 expect(b,text).toBeDefined();
 await act(async()=>b?.click());await tick();
}
async function form(){
 await act(async()=>{
  for(const [name,value] of Object.entries({
   clientOwnerName:"Ирина",clientPhone:"+79991234567",petName:"Рекс",
   petAge:"2 года",petBreed:"Корги",
   clientProblem:"Собака перевозбуждается на прогулках",
   clientSelfHelpAttempt:"Пробовали тренировки",
  })){
   const field=node.querySelector<HTMLInputElement|HTMLTextAreaElement>(
    '[name="'+name+'"]');
   expect(field,name).not.toBeNull();
   const proto=field instanceof HTMLTextAreaElement?
    HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(proto,"value")?.set?.call(field,value);
   field?.dispatchEvent(new Event("input",{bubbles:true}));
  }
 });
 await act(async()=>node.querySelector("form")?.dispatchEvent(
  new Event("submit",{bubbles:true,cancelable:true})));await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal("crypto",{randomUUID:()=>"12345678-1234-4567-89ab-123456789abc"});
 cache=new QueryClient({defaultOptions:{queries:{
  retry:false,refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
 specialists=vi.fn(async()=>catalog());
 getSlots=vi.fn(async()=>slots());
 getMine=vi.fn(async()=>mine());
 verify=vi.fn(async()=>({httpStatus:200,success:true}));
 submit=vi.fn(async()=>ack());
 readback=vi.fn(async()=>mine());
 fixture={fixtureKind:"AG2_BOOKING_SYNTHETIC_ONLY",
  verifySlot:verify,submitBooking:submit,readbackMy:readback};
 fetcher=vi.fn(async(url:string,options:RequestInit)=>{
  if(options?.method!=="GET")throw Error("MUTATION_HTTP_FORBIDDEN");
  if(url==="/api/v1/user/profile")return new Response(JSON.stringify({
   success:true,data:{id:"A",username:"ownerA",
    profile:{fullName:"Владелец",city:"Самара",about:"Консультации"},
    email:"SECRET_EMAIL",phone:"SECRET_PHONE"}}),{status:200});
  throw Error("UNAUTHORIZED_HTTP_"+url);
 });
 vi.stubGlobal("fetch",fetcher);
 node=document.createElement("div");document.body.append(node);root=createRoot(node);
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();node.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");
});
describe("WEB consultations connected actual App route-source opt-in",()=>{
 it("F01 default route is connected live, never uses synthetic fixture",async()=>{
  await mount("/consultations",false);
  expect(node.textContent).toContain("Консультации с кинологом");
  expect(node.textContent).not.toContain("Страница не найдена");
  expect(fetcher).toHaveBeenCalledWith("/api/v1/consultations/cynologists",expect.any(Object));
  await mount("/consultations/cynologists/trainer1/slots/slot_01",false);
  expect(node.textContent).not.toContain("Страница не найдена");
  expect(specialists).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
 });
 it("F02 profile -> list -> published trainer -> slots -> mock intake -> my bookings",async()=>{
  await mount();
  await link("/consultations");
  expect(location.pathname).toBe("/consultations");
  expect(node.textContent).toContain("Кинолог Анна");
  await link("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("@trainer_a");
  expect(node.textContent).toContain("Работа с поведением");
  await click("Посмотреть свободное время");
  expect(location.pathname).toBe("/consultations/trainer1");
  expect(getSlots).toHaveBeenCalledWith("trainer1",expect.any(Object));
  expect(node.textContent).toContain("11:00");
  await click("Открыть форму (макет)");
  expect(location.pathname).toBe("/consultations/cynologists/trainer1/slots/slot_01");
  expect(node.textContent).toContain("Только макет");
  await form();
  expect(node.textContent).toContain("Подтверждение обращения");
  await click("Проверить и отправить макет");
  expect(verify).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain("не настоящая бронь");
  await click("К моим записям");
  expect(location.pathname).toBe("/consultations/mine");
  expect(node.textContent).toContain("Ожидает подтверждения");
  expect(getMine).toHaveBeenCalledWith("ownerA",null);
  expect(fetcher.mock.calls.every(([,o])=>o.method==="GET")).toBe(true);
  expect(node.innerHTML).not.toMatch(/SECRET_|PRIVATE_/);
 });
 it("F03 direct trainer profile only from published list",async()=>{
  await mount("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("@trainer_a");
  expect(getSlots).not.toHaveBeenCalled();
  expect(getMine).not.toHaveBeenCalled();
 });
 it("F04 unknown trainer never loads slots",async()=>{
  await mount("/consultations/cynologists/unknown/slots");
  expect(node.textContent).toContain("Кинолог не найден");
  expect(getSlots).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
 });
 it("F05 direct slot booking only FREE, exact trainer, fixture",async()=>{
  await mount("/consultations/cynologists/trainer1/slots/slot_01");
  expect(node.textContent).toContain("Только макет");
  expect(verify).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
 });
 it("F06 unavailable/stale slot fails before form/submit",async()=>{
  getSlots.mockResolvedValueOnce({items:[],eligibility:eligible});
  await mount("/consultations/cynologists/trainer1/slots/slot_01");
  expect(node.textContent).toContain("Слот больше недоступен");
  expect(node.textContent).not.toContain("Обращение к кинологу");
  expect(submit).not.toHaveBeenCalled();
 });
 it("F07 direct booking without explicit synthetic fixture 404",async()=>{
  await mount("/consultations/cynologists/trainer1/slots/slot_01",true,false);
  expect(node.textContent).toContain("Страница не найдена");
  expect(specialists).not.toHaveBeenCalled();
 });
 it("F08 server eligibility false prevents form",async()=>{
  getSlots.mockResolvedValueOnce({items:[slot],eligibility:{
   canBook:false,reason:"ACTIVE_BOOKING",nextBookingAt:null,
   message:"SECRET_PRIVATE_ELIGIBILITY",
  }});
  await mount("/consultations/cynologists/trainer1/slots/slot_01");
  expect(node.textContent).not.toContain("Обращение к кинологу");
  expect(node.textContent).not.toContain("SECRET_PRIVATE_ELIGIBILITY");
  expect(submit).not.toHaveBeenCalled();
 });
 it("F09 direct my bookings uses own username, not query params",async()=>{
  await mount("/consultations/mine?username=other&cursor=SECRET_CURSOR");
  expect(getMine).toHaveBeenCalledExactlyOnceWith("ownerA",null);
  expect(node.textContent).toContain("Рекс");
  expect(node.innerHTML).not.toContain("SECRET_CURSOR");
 });
 it("F10 source route rejects malformed/reserved URLs",()=>{
  expect(routeForPath("/consultations/cynologists/trainer1/slots/../secret"))
   .toBeNull();
  expect(routeForPath("/consultations/cynologists/%2F")).toBeNull();
  expect(routeForPath("/consultations/admin/bookings")).toBeNull();
  expect(consultationRouteFromPath("/consultations/mine")).toEqual({kind:"mine"});
  expect(consultationLegacySlotsPath("trainer1")).toBe("/consultations/trainer1");
  expect(consultationLegacyConfirmPath("trainer1"))
   .toBe("/consultations/trainer1/confirm");
  expect(consultationRouteFromPath("/consultations/trainer1"))
   .toEqual({kind:"slots",trainerId:"trainer1"});
  expect(consultationRouteFromPath("/consultations/trainer1/confirm"))
   .toEqual({kind:"booking",trainerId:"trainer1"});
  expect(routeForPath("/consultations/call/booking_01")).toBe("/consultations/call/booking_01");
  expect(consultationPath({kind:"booking",trainerId:"trainer1",
   slotId:"slot_01"})).toBe("/consultations/cynologists/trainer1/slots/slot_01");
  expect(()=>consultationPath({kind:"trainer",trainerId:"../wrong"})).toThrow();
 });
 it("F11 browser history Back/Forward tracks real URL",async()=>{
  await mount("/consultations");
  await link("/consultations/cynologists/trainer1");
  expect(location.pathname).toBe("/consultations/cynologists/trainer1");
  await act(async()=>{history.back();await new Promise(ok=>setTimeout(ok,48));});
  await tick();
  expect(location.pathname).toBe("/consultations");
  await act(async()=>{history.forward();await new Promise(ok=>setTimeout(ok,48));});
  await tick();
  expect(location.pathname).toBe("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("@trainer_a");
 });
 it("F12 unknown booking result requires manual readback, no automatic retry",async()=>{
  submit.mockRejectedValueOnce(Error("CONNECTION_LOST_AFTER_COMMIT"));
  await mount("/consultations/cynologists/trainer1/slots/slot_01");
  await form();await click("Проверить и отправить макет");
  expect(node.textContent).toContain("Результат неизвестен");
  expect(submit).toHaveBeenCalledTimes(1);
  await click("Проверить мои записи (макет)");
  expect(readback).toHaveBeenCalledWith("ownerA",null);
  expect(submit).toHaveBeenCalledTimes(1);
 });
 // Multi-step synthetic React act + route back/navigation can exceed Vitest's
 // generic 5 s limit under a full Web regression; never relax assertions.
 it("F13 no second synthetic submission for previously attempted slot in same scope",async()=>{
  await mount("/consultations/cynologists/trainer1/slots/slot_01");
  await form();await click("Проверить и отправить макет");
  await click("К слотам");
  const disabled=[...node.querySelectorAll<HTMLButtonElement>("button")]
   .find(b=>b.textContent?.includes("Уже проверен в макете"));
  expect(disabled?.disabled).toBe(true);
  await act(async()=>navigate(consultationPath({kind:"booking",
   trainerId:"trainer1",slotId:"slot_01"})));await tick();
  expect(node.textContent).toContain("Повторная отправка запрещена");
  expect(submit).toHaveBeenCalledTimes(1);
 },12000);
 it("F14 A->B->A during pending trainer detail is fenced",async()=>{
  const d=hold<Catalog>();
  specialists.mockResolvedValueOnce(catalog()).mockReturnValueOnce(d.promise);
  await mount("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("Загружаем профиль кинолога");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
   {id:"B",username:"ownerB",role:"USER"}));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
   {id:"A",username:"ownerA",role:"USER"}));
  await act(async()=>d.resolve(catalog()));await tick();
  expect(node.textContent).toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("Работа с поведением");
 });
 it("F15 late synthetic ACK after session change cannot show or resend",async()=>{
  const d=hold<BookMockReply>();submit.mockReturnValueOnce(d.promise);
  await mount("/consultations/cynologists/trainer1/slots/slot_01");
  await form();await click("Проверить и отправить макет");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
   {id:"B",username:"ownerB",role:"USER"}));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
   {id:"A",username:"ownerA",role:"USER"}));
  await act(async()=>d.resolve(ack()));await tick();
  expect(node.textContent).toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("не настоящая бронь");
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it("F17 Next legacy /consultations/:id opens slots, not private profile",async()=>{
  await mount("/consultations/trainer1");
  expect(node.textContent).toContain("Свободное время");
  expect(getSlots).toHaveBeenCalledWith("trainer1",expect.any(Object));
  expect(node.textContent).not.toContain("@trainer_a");
 });
 it("F18 legacy confirm ?slotId binds FREE slot, ignores injected date",async()=>{
  await mount("/consultations/trainer1/confirm?slotId=slot_01"+
   "&startAtUtc=2099-01-01T00%3A00%3A00Z&endAtUtc=2099-01-01");
  expect(node.textContent).toContain("Только макет");
  expect(node.textContent).toContain("11:00");
  expect(node.innerHTML).not.toContain("2099-01-01");
  await form();await click("Проверить и отправить макет");
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0].body.slotId).toBe("slot_01");
 });
 it("F19 legacy confirm without single valid slotId is 404 before load",async()=>{
  await mount("/consultations/trainer1/confirm");
  expect(node.textContent).toContain("Страница не найдена");
  expect(specialists).not.toHaveBeenCalled();
  await mount("/consultations/trainer1/confirm?slotId=slot_01&slotId=slot_02");
  expect(node.textContent).toContain("Страница не найдена");
  expect(specialists).not.toHaveBeenCalled();
 });
 it("F20 legacy confirm unknown slot blocks synthetic submit",async()=>{
  await mount("/consultations/trainer1/confirm?slotId=absent");
  expect(node.textContent).toContain("Слот больше недоступен");
  expect(node.textContent).not.toContain("Обращение к кинологу");
  expect(submit).not.toHaveBeenCalled();
 });
 it("F16 published trainer disappearing between catalog and detail denies",async()=>{
  specialists.mockResolvedValueOnce(catalog()).mockResolvedValueOnce({
   items:[],eligibility:eligible,
  });
  await mount("/consultations/cynologists/trainer1");
  expect(node.textContent).toContain("не найден в опубликованном списке");
  expect(getSlots).not.toHaveBeenCalled();
 });
});
