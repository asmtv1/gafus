// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ConsultationSlotsCalendar} from "./ConsultationSlotsCalendar";
import type {CalendarSlotsView,Specialist} from "./consultationReadApi";
const specialist:Specialist={id:"cy1",userId:"trainer1",username:"trainer1",
  name:"Кинолог Анна",about:null,slotDurationMin:45};
const eligible={canBook:true,reason:null,nextBookingAt:null,message:null} as const;
const slot=(id:string,day:string,status:"FREE"|"BOOKED"|"BLOCKED")=>({
  id,startAtUtc:`${day}T08:00:00.000Z`,endAtUtc:`${day}T08:45:00.000Z`,status,
});
const calendar:CalendarSlotsView={items:[
  slot("free-oct","2026-10-27","FREE"),
  slot("booked","2026-10-28","BOOKED"),
  slot("dayoff","2026-10-29","FREE"),
  slot("free-nov","2026-11-02","FREE"),
],eligibility:eligible,dayOffDates:["2026-10-29"]};
const range={from:"2026-10-26T21:00:00.000Z",to:"2026-11-10T20:59:59.999Z"};
let host:HTMLDivElement,root:Root;
async function renderAs(ownerId:string,data=calendar){await act(async()=>root.render(
  <ConsultationSlotsCalendar specialist={specialist} ownerId={ownerId}
    calendar={data} range={range} refresh={()=>undefined}/>));}
async function render(data=calendar){await renderAs("ownerA",data);}
const cell=(key:string)=>host.querySelector<HTMLButtonElement>(
  `[data-consultation-day-key="${key}"]`);
async function click(button:HTMLButtonElement|null){await act(async()=>button?.click());}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.history.replaceState(null,"","/consultations/trainer1");
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
describe("WEB5 Next calendar connected presentation",()=>{
  it("shows full month, weekends, day-off and free count; October initially selected",async()=>{
    await render();
    expect(host.textContent).toContain("Часовой пояс: МСК (UTC+3)");
    expect(host.textContent).toContain("Длительность консультации: до 45 мин");
    expect(host.textContent).toContain("октябрь 2026");
    expect(cell("2026-10-27")?.dataset.selected).toBe("true");
    expect(cell("2026-10-29")?.dataset.dayOff).toBe("true");
    expect(cell("2026-10-29")?.textContent).toContain("0 св.");
    expect(cell("2026-10-27")?.textContent).toContain("1 св.");
    expect(cell("2026-10-28")?.textContent).toContain("0 св.");
    expect(host.querySelectorAll('a[href*="slot_"]').length).toBe(0);
    expect(host.textContent).toContain("11:00 - 11:45");
  });
  it("Next cold-load defaults to first allowed day, not later first FREE slot",async()=>{
    await render({...calendar,items:[slot("busy-first","2026-10-27","BOOKED"),
      slot("available-later","2026-10-30","FREE")]});
    expect(cell("2026-10-27")?.dataset.selected).toBe("true");
    expect(cell("2026-10-30")?.dataset.selected).toBe("false");
    expect(host.textContent).toContain("Занято");
    expect(host.querySelector('button:not(:disabled).consult-live-calendar-book')).toBeNull();
  });
  it("occupied day is shown but booking disabled; next month only FREE links",async()=>{
    await render();
    await click(cell("2026-10-28"));
    expect(host.textContent).toContain("Занято");
    expect(host.querySelector('a[href*="booked"]')).toBeNull();
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Следующий месяц"]'));
    expect(host.textContent).toContain("ноябрь 2026");
    await click(cell("2026-11-02"));
    expect([...host.querySelectorAll<HTMLButtonElement>("button")]
      .some(button=>button.textContent?.trim()==="Выбрать слот")).toBe(true);
    expect(host.querySelector('a[href*="dayoff"]')).toBeNull();
  });
  it("source Next verifies one physical FREE slot by owner GET before navigating",async()=>{
    const fetcher=vi.fn(async(_path:string)=>new Response(JSON.stringify({success:true,data:{}}),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    await render();
    const book=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.trim()==="Выбрать слот");
    await click(book??null);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "/api/v1/consultations/cynologists/trainer1/slots/free-oct/verify");
    expect(window.location.pathname).toBe(
      "/consultations/cynologists/trainer1/slots/free-oct");
  });
  it("409 owner GET stays on calendar and does not navigate to stale slot",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({
      success:false,error:"Время уже занято",code:"CONFLICT",
    }),{status:409}));
    vi.stubGlobal("fetch",fetcher);
    await render();
    const book=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.trim()==="Выбрать слот");
    await click(book??null);
    expect(window.location.pathname).toBe("/consultations/trainer1");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Время уже занято");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("owner change during pending verification unlocks only the new owner's request",async()=>{
    const resolutions: ((result:Response)=>void)[]=[];
    const fetcher=vi.fn(()=>new Promise<Response>(resolve=>resolutions.push(resolve)));
    vi.stubGlobal("fetch",fetcher);
    await renderAs("ownerA");
    const booking=()=>host.querySelector<HTMLButtonElement>(
      "button.consult-live-calendar-book");
    await click(booking());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(booking()?.disabled).toBe(true);
    // Account B must be able to verify without the old owner's late response.
    await renderAs("ownerB");
    expect(booking()?.disabled).toBe(false);
    await click(booking());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(booking()?.disabled).toBe(true);
    await act(async()=>{
      resolutions[0](new Response(JSON.stringify({success:true,data:{}}),{status:200}));
      await Promise.resolve();
    });
    expect(window.location.pathname).toBe("/consultations/trainer1");
    expect(booking()?.disabled).toBe(true);
    await act(async()=>{
      resolutions[1](new Response(JSON.stringify({success:true,data:{}}),{status:200}));
      await Promise.resolve();
    });
    expect(window.location.pathname).toBe(
      "/consultations/cynologists/trainer1/slots/free-oct");
  });
  it("server eligibility denial prevents booking links without local bypass",async()=>{
    await render({...calendar,eligibility:{canBook:false,reason:"ACTIVE_BOOKING",
      nextBookingAt:null,message:"Уже есть запись"}});
    expect(host.textContent).toContain("Уже есть запись");
    expect(host.querySelector('.next-consultation-calendar')).toBeNull();
    expect(host.querySelector('a[href*="slots"]')).toBeNull();
  });
});
