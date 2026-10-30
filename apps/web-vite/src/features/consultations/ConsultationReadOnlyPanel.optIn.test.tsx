// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProfileOverview} from "../profile/ProfileOverview";
import {ConsultationOptInHarness} from "./ConsultationOptInHarness";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ApiError} from "../../shared/api/client";
import type {BookingsPage,Catalog,SlotRange,SlotsView}
  from "./consultationReadApi";
const profile=vi.hoisted(()=>({get:vi.fn()}));
vi.mock("../profile/profileApi",()=>({
  getMyProfile:profile.get,updateMyProfile:vi.fn(),
}));
const goodEligibility={canBook:true,reason:null,nextBookingAt:null,message:null} as const;
const specialist={id:"cy1",userId:"trainer1",username:"trainer_a",
  name:"Кинолог Анна",about:"Специалист по поведению",slotDurationMin:45};
const catalog=():Catalog=>({items:[specialist],eligibility:goodEligibility});
const slot={id:"s1",startAtUtc:"2026-10-19T08:00:00.000Z",
  endAtUtc:"2026-10-19T08:45:00.000Z",status:"FREE" as const};
const slots=():SlotsView=>({items:[slot],eligibility:goodEligibility});
const booking={id:"b1",status:"CONFIRMED" as const,slot:{...slot,status:"BOOKED" as const},
  cynologistUserId:"trainer1",cynologistName:"Кинолог Анна",
  petName:"Шарик",cancelReason:null};
const mine=():BookingsPage=>({items:[booking],nextCursor:null});
const defer=<T,>()=>{
  let resolve!:(v:T)=>void;
  const promise=new Promise<T>(yes=>{resolve=yes;});
  return {promise,resolve};
};
let host:HTMLDivElement,root:Root,cache:QueryClient;
let specialists:ReturnType<typeof vi.fn<()=>Promise<Catalog>>>;
let getSlots:ReturnType<typeof vi.fn<(id:string,range:SlotRange)=>Promise<SlotsView>>>;
let getMine:ReturnType<typeof vi.fn<
  (username:string,cursor:string|null)=>Promise<BookingsPage>
>>;
async function flush(){
  await act(async()=>{await new Promise(ok=>setTimeout(ok,18));});
}
async function render(element:React.ReactNode){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    {element}
  </QueryClientProvider>));
  await flush();
}
async function view(enabled=true,uid:string|null="A"){
  await render(<ConsultationOptInHarness enabled={enabled} userId={uid}
    username={uid?"ownerA":null}
    now={new Date("2026-10-17T16:00:00Z")}
    loaders={{specialists,slots:getSlots,mine:getMine}}/>);
}
async function inProfile(enabled=true){
  await render(<ProfileOverview userId="A" showConsultationsOptIn={enabled}
    consultationsNow={new Date("2026-10-17T16:00:00Z")}
    consultationsLoaders={{specialists,slots:getSlots,mine:getMine}}/>);
}
async function open(){
  const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent==="Консультации с кинологом");
  expect(b).toBeTruthy();
  await act(async()=>b?.click());await flush();
}
async function selectSlots(){
  const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent==="Посмотреть свободное время");
  expect(b).toBeTruthy();
  await act(async()=>b?.click());await flush();
}
async function selectMy(){
  const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent==="Мои записи");
  expect(b).toBeTruthy();
  await act(async()=>b?.click());await flush();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("NO_LIVE_NETWORK");}));
  profile.get.mockReset().mockResolvedValue({
    id:"A",username:"ownerA",profile:{fullName:"Ирина",city:"Самара",about:""},
  });
  specialists=vi.fn().mockResolvedValue(catalog());
  getSlots=vi.fn().mockResolvedValue(slots());
  getMine=vi.fn().mockResolvedValue(mine());
  cache=new QueryClient({defaultOptions:{queries:{
    retry:false,refetchOnWindowFocus:false,
  }}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/profile");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("G11-G13 consultation read-only profile mounted opt-in",()=>{
  it("C-M01 profile opt-in off: no requests or consultation entry",async()=>{
    await inProfile(false);
    expect(host.textContent).toContain("Ирина");
    expect(host.textContent).not.toContain("Консультации с кинологом");
    expect(specialists).not.toHaveBeenCalled();
  });
  it("C-M02 profile -> specialists -> Moscow FREE slots -> back -> my server status",async()=>{
    await inProfile();await open();
    expect(host.textContent).toContain("Доступные специалисты");
    expect(host.textContent).toContain("Кинолог Анна");
    expect(specialists).toHaveBeenCalledTimes(1);
    await selectSlots();
    expect(getSlots).toHaveBeenCalledTimes(1);
    expect(getSlots.mock.calls[0][0]).toBe("trainer1");
    expect(host.textContent).toContain("11:00");
    expect(host.textContent).toContain("Свободно");
    const back=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.includes("К специалистам"));
    await act(async()=>back?.click());await flush();
    await selectMy();
    expect(getMine).toHaveBeenCalledExactlyOnceWith("ownerA",null);
    expect(host.textContent).toContain("Подтверждена");
    expect(host.textContent).toContain("Шарик");
    expect(host.textContent).not.toContain("Отменить запись");
    expect(host.textContent).not.toContain("Забронировать");
    // The owner profile may also ask whether the Moments tab is available;
    // it must never issue consultation writes or access unrelated data here.
    const calls=vi.mocked(globalThis.fetch).mock.calls;
    // Private notes are fetched only on /profile?tab=notes, not during consultations.
    expect(calls.map(([url])=>url)).not.toContain("/api/v1/notes/student");
    expect(calls.every(([url,init])=>
      ["/api/v1/notes/student","/api/v1/feed/status"].includes(String(url))&&
      (init as RequestInit|undefined)?.method!=="POST")).toBe(true);
    expect(window.location.pathname).toBe("/profile");
  });
  it("C-M03 guest and initial mismatched principal do not read data",async()=>{
    await view(true,null);
    expect(host.textContent).toBe("");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    await view();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(specialists).not.toHaveBeenCalled();
  });
  it("C-M04 catalog pending/empty state real conditions",async()=>{
    const pending=defer<Catalog>();specialists.mockReturnValueOnce(pending.promise);
    await view();await open();
    expect(host.textContent).toContain("Загружаем специалистов");
    await act(async()=>pending.resolve({items:[],eligibility:goodEligibility}));
    await flush();
    expect(host.textContent).toContain("Пока нет доступных кинологов");
  });
  it("C-M05 slots pending/empty with no booking button",async()=>{
    const pending=defer<SlotsView>();getSlots.mockReturnValueOnce(pending.promise);
    await view();await open();await selectSlots();
    expect(host.textContent).toContain("Загружаем свободные слоты");
    await act(async()=>pending.resolve({items:[],eligibility:goodEligibility}));
    await flush();
    expect(host.textContent).toContain("свободного времени нет");
    expect(host.querySelectorAll(".consultation-slot-list li")).toHaveLength(0);
  });
  it("C-M06 my pending/empty with no fake bookings",async()=>{
    const pending=defer<BookingsPage>();getMine.mockReturnValueOnce(pending.promise);
    await view();await open();await selectMy();
    expect(host.textContent).toContain("Загружаем мои консультации");
    await act(async()=>pending.resolve({items:[],nextCursor:null}));await flush();
    expect(host.textContent).toContain("пока нет записей");
  });
  it("C-M07 bookings nextCursor paginates without commands",async()=>{
    getMine.mockReset().mockImplementation(async(_username,cursor)=>{
      if(!cursor)return {items:[booking],nextCursor:"b1"};
      return {items:[{...booking,id:"b2",status:"COMPLETED"}],
        nextCursor:null};
    });
    await view();await open();await selectMy();
    const more=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Показать ещё записи");
    await act(async()=>more?.click());await flush();
    expect(getMine).toHaveBeenCalledWith("ownerA","b1");
    expect(host.querySelectorAll(".consultation-booking-card")).toHaveLength(2);
    expect(host.textContent).toContain("Завершена");
  });
  it.each([[401,"Сессия завершена"],[403,"Доступ"],[500,"Не удалось загрузить"]])(
    "C-M08-10 catalog HTTP %d redacted + manual retry",async(status,copy)=>{
      specialists.mockRejectedValueOnce(new ApiError(status,"PRIVATE_INTERNAL"))
        .mockResolvedValueOnce(catalog());
      await view();await open();
      expect(host.textContent).toContain(copy);
      expect(host.textContent).not.toContain("PRIVATE_INTERNAL");
      const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(x=>x.textContent==="Повторить");
      await act(async()=>retry?.click());await flush();
      expect(specialists).toHaveBeenCalledTimes(2);
      expect(host.textContent).toContain("Кинолог Анна");
    },
  );
  it("C-M11 slots HTTP 402 paywall status without starting payment",async()=>{
    getSlots.mockRejectedValueOnce(new ApiError(402,"STRIPE_SECRET"));
    await view();await open();await selectSlots();
    expect(host.textContent).toContain("активная подписка");
    expect(host.textContent).not.toContain("STRIPE_SECRET");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("C-M12 slots 403 and my 500 bounded status",async()=>{
    getSlots.mockRejectedValueOnce(new ApiError(403,"SECRET"));
    getMine.mockRejectedValueOnce(new ApiError(500,"OTHER_SECRET"));
    await view();await open();await selectSlots();
    expect(host.textContent).toContain("Доступ к консультациям ограничен");
    const back=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.includes("К специалистам"));
    await act(async()=>back?.click());await flush();await selectMy();
    expect(host.textContent).toContain("Не удалось загрузить мои консультации");
    expect(host.textContent).not.toMatch(/SECRET/);
  });
  it("C-M13 eligibility from server displayed and booking unavailable",async()=>{
    specialists.mockResolvedValueOnce({items:[specialist],
      eligibility:{canBook:false,reason:"ACTIVE_BOOKING",nextBookingAt:null,
        message:"Уже есть активная бронь"}});
    await view();await open();
    expect(host.textContent).toContain("Уже есть активная бронь");
    expect(host.querySelector('button[aria-label="Забронировать"]')).toBeNull();
  });
  it("C-M14 A->B pending slots prevents late response and 2nd GET",async()=>{
    const pending=defer<SlotsView>();getSlots.mockReturnValueOnce(pending.promise);
    await view();await open();await selectSlots();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>pending.resolve(slots()));await flush();
    expect(host.textContent).not.toContain("11:00");
    expect(getSlots).toHaveBeenCalledTimes(1);
  });
  it("C-M15 A->B->A cannot restore old bookings; logout clears",async()=>{
    await view();await open();await selectMy();
    expect(host.textContent).toContain("Подтверждена");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"ownerA",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Подтверждена");
    expect(getMine).toHaveBeenCalledTimes(1);
  });
  it("C-M16 explicit logout cache.clear closes old client appointments",async()=>{
    await view();await open();await selectMy();
    await act(async()=>cache.clear());
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Шарик");
  });
  it("C-M18 owner A->B during pending my records hides old private response",async()=>{
    const pending=defer<BookingsPage>();getMine.mockReturnValueOnce(pending.promise);
    await view();await open();await selectMy();
    expect(host.textContent).toContain("Загружаем мои консультации");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>pending.resolve(mine()));await flush();
    expect(host.textContent).not.toContain("Шарик");
    expect(getMine).toHaveBeenCalledTimes(1);
  });
  it("C-M19 same owner auth refresh fences old bookings even if id unchanged",async()=>{
    await view();await open();await selectMy();
    expect(host.textContent).toContain("Шарик");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"ownerA",role:"USER",sessionRevision:"new"}));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Шарик");
  });
  it.each([[401,"Сессия завершена"],[403,"Доступ"]])(
    "C-M20-21 my HTTP %d respects bounded status and single explicit retry",
    async(status,expected)=>{
      getMine.mockRejectedValueOnce(new ApiError(status,"PRIVATE_PHONE"))
        .mockResolvedValueOnce(mine());
      await view();await open();await selectMy();
      expect(host.textContent).toContain(expected);
      expect(host.textContent).not.toContain("PRIVATE_PHONE");
      const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(x=>x.textContent==="Повторить");
      await act(async()=>retry?.click());await flush();
      expect(getMine).toHaveBeenCalledTimes(2);
      expect(host.textContent).toContain("Шарик");
    });
  it("C-M17 narrow 360 mounted profile entry, two tabs and slot list",async()=>{
    vi.stubGlobal("innerWidth",360);
    document.documentElement.style.width="360px";
    await inProfile();await open();await selectSlots();
    expect(host.querySelector(".consultations-readonly-nav")).not.toBeNull();
    expect(host.querySelectorAll(".consultation-slot-list li")).toHaveLength(1);
    expect(window.location.pathname).toBe("/profile");
  });
});
