// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ConsultationOptInHarness} from "./ConsultationOptInHarness";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {BookingSourceMockTransport,BookMockReply} from "./bookingSourceMock";
import type {Catalog,SlotsView,SlotRange,BookingsPage} from "./consultationReadApi";
const elig={canBook:true,reason:null,nextBookingAt:null,message:null} as const;
const trainer={id:"cy1",userId:"trainer1",username:"trainer_a",
  name:"Кинолог Анна",about:"Поведение",slotDurationMin:45};
const slot={id:"slot1",startAtUtc:"2026-10-19T08:00:00.000Z",
  endAtUtc:"2026-10-19T08:45:00.000Z",status:"FREE" as const};
const booking={id:"b1",status:"PENDING_TRAINER_CONFIRMATION" as const,
  slot:{...slot,status:"BOOKED" as const},cynologistUserId:"trainer1",
  cynologistName:"Кинолог Анна",petName:"Шарик",cancelReason:null};
const ack=():BookMockReply=>({httpStatus:201,success:true,
  data:{kind:"created",booking:{id:"b1",
    status:"PENDING_TRAINER_CONFIRMATION",slot,
    cynologistUserId:"trainer1",clientUsername:"ownerA"}}});
const deferred=<T,>()=>{
  let resolve!:(x:T)=>void;
  const promise=new Promise<T>(f=>{resolve=f;});
  return {promise,resolve};
};
let host:HTMLDivElement,root:Root,cache:QueryClient;
let verify:ReturnType<typeof vi.fn<BookingSourceMockTransport["verifySlot"]>>;
let submit:ReturnType<typeof vi.fn<BookingSourceMockTransport["submitBooking"]>>;
let readback:ReturnType<typeof vi.fn<BookingSourceMockTransport["readbackMy"]>>;
let slots:ReturnType<typeof vi.fn<(id:string,r:SlotRange)=>Promise<SlotsView>>>;
let fixture:BookingSourceMockTransport;
async function flush(){await act(async()=>{await new Promise(f=>setTimeout(f,12));});}
async function mount(enabled=true,withMock=true){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <ConsultationOptInHarness enabled={enabled} userId="A"
      username="ownerA" now={new Date("2026-10-17T16:00:00Z")}
      loaders={{specialists:async():Promise<Catalog>=>({
        items:[trainer],eligibility:elig}),slots,
        mine:async():Promise<BookingsPage>=>({items:[],nextCursor:null})}}
      bookingMockTransport={withMock?fixture:undefined}/>
  </QueryClientProvider>));await flush();
}
async function click(label:string){
  const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent?.trim()===label);
  expect(b,"missing "+label).toBeDefined();
  await act(async()=>b?.click());await flush();
}
async function open(withMock=true){
  await mount(true,withMock);
  await click("Консультации с кинологом");
  await click("Посмотреть свободное время");
  if(withMock)await click("Открыть форму (макет)");
}
async function complete(){
  await act(async()=>{
    for(const [k,v] of Object.entries({
      clientOwnerName:"Ирина",clientPhone:"+79991234567",
      petName:"Шарик",petAge:"2 года",petBreed:"Такса",
      clientProblem:"Собака перевозбуждается во время прогулки",
      clientSelfHelpAttempt:"Пробовали дома",
    })){
      const e=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(
        '[name="'+k+'"]');
      if(!e)throw Error("missing "+k);
      const proto=e instanceof HTMLTextAreaElement?
        HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,"value")?.set?.call(e,v);
      e.dispatchEvent(new Event("input",{bubbles:true}));
    }
  });
  await act(async()=>host.querySelector("form")?.dispatchEvent(new Event(
    "submit",{bubbles:true,cancelable:true})));
  await flush();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("crypto",{randomUUID:()=>"12345678-1234-4567-89ab-123456789abc"});
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("LIVE_HTTP_FORBIDDEN");}));
  cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
  verify=vi.fn().mockResolvedValue({httpStatus:200,success:true});
  submit=vi.fn().mockResolvedValue(ack());
  readback=vi.fn().mockResolvedValue({items:[booking],nextCursor:null});
  slots=vi.fn().mockResolvedValue({items:[slot],eligibility:elig});
  fixture={fixtureKind:"AG2_BOOKING_SYNTHETIC_ONLY",
    verifySlot:verify,submitBooking:submit,readbackMy:readback};
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();
  host.remove();vi.unstubAllGlobals();});
describe("AG2 connected synthetic consultation booking only",()=>{
  it("B01 no fixture, no form and no POST",async()=>{
    await open(false);
    expect(host.textContent).not.toContain("Открыть форму (макет)");
    expect(submit).not.toHaveBeenCalled();
  });
  it("B02 full form verify + single synthetic POST + ACK not real",async()=>{
    await open();await complete();
    expect(host.textContent).toContain("Подтверждение обращения");
    await click("Проверить и отправить макет");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].body.idempotencyKey).toBe(
      "12345678-1234-4567-89ab-123456789abc");
    expect(host.textContent).toContain("не настоящая бронь");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("B03 empty fields fail, zero submission",async()=>{
    await open();await click("К подтверждению");
    expect(host.textContent).toContain("Обращение к кинологу");
    expect(verify).not.toHaveBeenCalled();
  });
  it("B04 double confirm while verify pending => single submit",async()=>{
    const d=deferred<{httpStatus:number;success:boolean}>();
    verify.mockReturnValueOnce(d.promise);
    await open();await complete();
    const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Проверить и отправить макет");
    await act(async()=>{b?.click();b?.click();});
    expect(verify).toHaveBeenCalledTimes(1);
    await act(async()=>d.resolve({httpStatus:200,success:true}));await flush();
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("B05 lost ACK => unknown, manual readback, zero replay",async()=>{
    submit.mockRejectedValueOnce(Error("lost ACK"));
    await open();await complete();await click("Проверить и отправить макет");
    expect(host.textContent).toContain("Результат неизвестен");
    await click("Проверить мои записи (макет)");
    expect(readback).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("не доказывает");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it.each([[401,"Войдите"],[402,"подписка"],[403,"ограничено"],
    [409,"Слот уже занят"]])("B06-09 verify %d blocks POST",async(status,word)=>{
    verify.mockResolvedValueOnce({httpStatus:status,success:false});
    await open();await complete();await click("Проверить и отправить макет");
    expect(host.textContent).toContain(word);
    expect(submit).not.toHaveBeenCalled();
  });
  it("B10 POST conflict => no second request",async()=>{
    submit.mockResolvedValueOnce({httpStatus:409,success:false});
    await open();await complete();await click("Проверить и отправить макет");
    expect(host.textContent).toContain("Слот уже занят");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("B11 503 POST => UNKNOWN, no success assertion",async()=>{
    submit.mockResolvedValueOnce({httpStatus:503,success:false});
    await open();await complete();await click("Проверить и отправить макет");
    expect(host.textContent).toContain("Результат неизвестен");
  });
  it("B12 mock ACK + matching readback only synthetic",async()=>{
    await open();await complete();await click("Проверить и отправить макет");
    await click("Проверить мои записи (макет)");
    expect(host.textContent).toContain("найдена только в синтетическом");
  });
  it("B13 owner A->B while POST pending drops late ACK",async()=>{
    const d=deferred<BookMockReply>();submit.mockReturnValueOnce(d.promise);
    await open();await complete();await click("Проверить и отправить макет");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>d.resolve(ack()));await flush();
    expect(host.textContent).not.toContain("Получен ACK");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("B14 slot reenter after ACK remains one-shot",async()=>{
    await open();await complete();await click("Проверить и отправить макет");
    await click("К слотам");
    expect(host.textContent).toContain("Уже проверен в макете");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("B16 owner changes during verify: no later synthetic POST",async()=>{
    const d=deferred<{httpStatus:number;success:boolean}>();
    verify.mockReturnValueOnce(d.promise);
    await open();await complete();await click("Проверить и отправить макет");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"ownerB",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>d.resolve({httpStatus:200,success:true}));await flush();
    expect(submit).not.toHaveBeenCalled();
  });
  it("B17 A->B->A cannot resurrect already submitted session",async()=>{
    await open();await complete();await click("Проверить и отправить макет");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"ownerB",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Получен ACK");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("B18 late unknown readback after owner change cannot claim result",async()=>{
    const d=deferred<BookingsPage>();
    readback.mockReturnValueOnce(d.promise);
    await open();await complete();await click("Проверить и отправить макет");
    await click("Проверить мои записи (макет)");
    await act(async()=>cache.clear());
    await act(async()=>d.resolve({items:[booking],nextCursor:null}));await flush();
    expect(host.textContent).not.toContain("Запись найдена только");
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("B19 lost ACK remains terminal after close/reopen same opt-in profile",async()=>{
    submit.mockRejectedValueOnce(Error("LOST_ACK"));
    await open();await complete();await click("Проверить и отправить макет");
    expect(host.textContent).toContain("Результат неизвестен");
    await click("Вернуться в профиль");
    await click("Консультации с кинологом");
    await click("Посмотреть свободное время");
    expect(host.textContent).toContain("Уже проверен в макете");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("B15 eligibility prevents opening mock form",async()=>{
    slots.mockResolvedValueOnce({items:[slot],eligibility:{
      canBook:false,reason:"ACTIVE_BOOKING",nextBookingAt:null,message:"Уже есть запись"}});
    await mount();await click("Консультации с кинологом");
    await click("Посмотреть свободное время");
    expect(host.textContent).not.toContain("Открыть форму (макет)");
    expect(submit).not.toHaveBeenCalled();
  });
});
