// @vitest-environment jsdom
import {act,StrictMode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
const eligible={canBook:true,reason:null,nextBookingAt:null,message:null};
const specialist={id:"cy1",userId:"trainer1",username:"trainer_a",displayName:"Кинолог Анна",
  about:"Поведение собак",avatarUrl:null,slotDurationMin:45};
const slot={id:"slot1",startAtUtc:"2026-11-01T08:00:00.000Z",
  endAtUtc:"2026-11-01T08:45:00.000Z",status:"FREE"};
const booking={id:"booking1",status:"CONFIRMED",slot:{...slot,status:"BOOKED"},
  cynologistUserId:"trainer1",cynologistDisplayName:"Кинолог Анна",clientUsername:"ownerA",
  clientOwnerName:"Секрет",clientPhone:"+79991234567",petName:"Рекс",petGender:"MALE",
  petAge:"2 года",petBreed:"Корги",clientProblem:"Секретная проблема",
  clientSelfHelpAttempt:"Секретная попытка",cancelReason:null,
  confirmationDeadlineAt:"2026-10-30T12:00:00.000Z",createdAt:"2026-10-29T12:00:00.000Z"};
const ok=(data:unknown,extra:Record<string,unknown>={})=>new Response(
  JSON.stringify({success:true,data,...extra}),{status:200});
let node:HTMLDivElement,root:Root,cache:QueryClient,fetcher:ReturnType<typeof vi.fn>;
let catalogItems:(typeof specialist)[];
let cancellationCommitted:boolean;
let cancellationAckLost:boolean;
let cancellationEarlyDrop:boolean;
let journeyMode:boolean;
let bookingCreated:boolean;
let bookOutcome:"success"|"lost_ack"|"no_subscription";
let slotsRequireSubscription:boolean;
// Warm only modules exercised by this synthetic App test; production stays lazy.
beforeAll(async()=>{await Promise.all([
 import("./ConsultationsLivePage"),
]);});
async function tick(){for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(done=>setTimeout(done,100));});
}}
async function mount(path:string,guest=false,strict=false){
  window.history.replaceState(null,"",path);
  if(guest)cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
  else cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner1",username:"ownerA",role:"USER"});
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    {strict?<StrictMode><App/></StrictMode>:<App/>}
  </QueryClientProvider>));
  await tick();
}
beforeEach(()=>{
  // This synthetic appointment fixture is pinned to 2026-10-27; modern
  // production calendars must never consider an expired mock slot bookable.
  // Only the Date clock is fixed: React timers/async GET continue normally.
  vi.useFakeTimers({toFake:["Date"]});
  vi.setSystemTime(new Date("2026-10-27T08:00:00.000Z"));
  catalogItems=[specialist];
  cancellationCommitted=false;cancellationAckLost=false;cancellationEarlyDrop=false;
  journeyMode=false;bookingCreated=false;bookOutcome="success";slotsRequireSubscription=false;
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  node=document.createElement("div");document.body.append(node);root=createRoot(node);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  fetcher=vi.fn(async (path:string,options?:RequestInit)=>{
    if(path==="/api/v1/consultations/cynologists")return ok(catalogItems,{bookingEligibility:eligible});
    if(path.startsWith("/api/v1/consultations/cynologists/trainer1/slots?")){
      if(slotsRequireSubscription)return new Response(JSON.stringify({
        success:false,error:"Для действия нужна подписка",code:"SUBSCRIPTION_REQUIRED",
      }),{status:402});
      return ok([slot],{bookingEligibility:eligible});
    }
    if(path==="/api/v1/app-subscription/offer")return ok({
      yookassaPlans:[
        {code:"TWO_WEEKS",title:"Самостоятельный",yookassaPriceRub:1185,intervalDays:30,
          currency:"RUB",enabled:true,promoCodeEligible:false,consultationBookingIncluded:false},
        {code:"MONTHLY",title:"Поддержка в чате",yookassaPriceRub:1465,intervalDays:30,
          currency:"RUB",enabled:true,promoCodeEligible:true,consultationBookingIncluded:false},
        {code:"THREE_MONTHS",title:"Полное сопровождение",yookassaPriceRub:2470,intervalDays:30,
          currency:"RUB",enabled:true,promoCodeEligible:true,consultationBookingIncluded:true},
      ],
      promoCode:{entryEnabled:true,eligible:true},savedRegistrationPromoCode:null,
    });
    if(path==="/api/v1/app-subscription/status")return ok({hasActiveSubscription:false});
    if(path.startsWith("/api/v1/consultations/my?"))return ok({
      items:journeyMode&&!bookingCreated?[]:[{
        ...booking,status:cancellationCommitted?"CANCELLED_BY_USER":"CONFIRMED",
      }],nextCursor:null,
    });
    if(path==="/api/v1/consultations/cynologists/trainer1/slots/slot1/verify")
      return new Response(JSON.stringify({success:true}),{status:200});
    if(path==="/api/v1/consultations/book"&&options?.method==="POST"){
      if(bookOutcome==="no_subscription")return new Response(JSON.stringify({
        success:false,error:"Для действия нужна подписка",code:"SUBSCRIPTION_REQUIRED",
      }),{status:402});
      bookingCreated=true;
      if(bookOutcome==="lost_ack")throw Error("LOST_BOOKING_ACK");
      return new Response(JSON.stringify({
        success:true,data:{kind:"created",booking:{id:"booking1"}},
      }),{status:201});
    }
    if(path==="/api/v1/consultations/book/lookup"&&options?.method==="POST")
      return ok({state:bookingCreated?"FOUND":"UNKNOWN",
        ...(bookingCreated?{booking:{id:"booking1"}}:{})});
    if(path==="/api/v1/consultations/bookings/booking1/cancel"&&options?.method==="POST"){
      if(!cancellationEarlyDrop)cancellationCommitted=true;
      if(cancellationAckLost||cancellationEarlyDrop)throw Error("LOST_CANCEL_ACK");
      return ok({bookingId:"booking1"});
    }
    throw Error("UNEXPECTED_API_PATH:"+path);
  });
  vi.stubGlobal("fetch",fetcher);
  vi.stubGlobal("crypto",{randomUUID:()=>"12345678-1234-4567-89ab-123456789abc"});
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();node.remove();
  vi.unstubAllGlobals();vi.useRealTimers();window.history.replaceState(null,"","/");
});
async function fillConsultationForm(){
  const fields:Record<string,string>={clientOwnerName:"Анна",clientPhone:"+79991234567",
    petName:"Рекс",petAge:"2 года",petBreed:"Корги"};
  for(const [name,value] of Object.entries(fields)){
    const input=node.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    expect(input,name).not.toBeNull();
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(input,value);
      input.dispatchEvent(new Event("input",{bubbles:true}));
    });
  }
  const gender=node.querySelector<HTMLSelectElement>("select")!;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set?.call(gender,"MALE");
    gender.dispatchEvent(new Event("change",{bubbles:true}));
  });
  const texts=node.querySelectorAll<HTMLTextAreaElement>("textarea");
  expect(texts).toHaveLength(2);
  for(const [index,value] of ["Собака прыгает на прохожих", "Работали с выдержкой"].entries()){
    const textarea=texts[index]!;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(textarea,value);
      textarea.dispatchEvent(new Event("input",{bubbles:true}));
    });
  }
  await tick();
  const submit=node.querySelector<HTMLButtonElement>("button[type=submit]");
  expect(submit?.disabled).toBe(false);
  await act(async()=>submit?.closest("form")?.dispatchEvent(new Event("submit",{
    bubbles:true,cancelable:true,
  })));
  await tick();
}
describe("default live consultation Web routes",()=>{
  it("GET 402 on choosing trainer time presents the single eligible SBP checkout",async()=>{
    slotsRequireSubscription=true;
    await mount("/consultations/trainer1");
    expect(node.textContent).toContain("Откройте запись на консультацию");
    expect(node.textContent).toContain("Полное сопровождение");
    expect(node.textContent).toContain("2 470");
    expect(node.querySelectorAll(".consultation-paywall-plan")).toHaveLength(1);
    expect(node.querySelectorAll(".subscription-plan")).toHaveLength(0);
    expect(node.querySelector<HTMLInputElement>("#subscription-promo-code")).not.toBeNull();
    expect(node.querySelector(".subscription-pay")?.textContent).toContain("по СБП");
    expect(node.textContent).not.toContain("Для записи требуется подходящая подписка");
    expect(fetcher.mock.calls.every(([,options])=>!options||options.method==="GET")).toBe(true);
    expect(node.querySelector(".subscription-sbp-logo")?.getAttribute("src"))
      .toBe("/images/sbp-logo.svg");
  });

  it("renders the original Next curator badges only for the exact public curator account",async()=>{
    catalogItems=[
      {...specialist,id:"curator",userId:"cmhq7qk2s0000nn01jr2ptnil",username:"lana",
        displayName:"Лана Петренко"},
      specialist,
    ];
    await mount("/consultations");
    const entries=[...node.querySelectorAll('section[aria-labelledby="consultations-catalog-title"] ul > li')];
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain("Составитель курсов");
    expect(entries[0].textContent).toContain("Главный кинолог проекта");
    expect(entries[1].textContent).not.toContain("Составитель курсов");
    expect(entries[1].textContent).not.toContain("Главный кинолог проекта");
  });
  it("catalog is visible without fixture and routes to real slot calendar",async()=>{
    await mount("/consultations");
    expect(node.textContent).toContain("Кинолог Анна");
    expect(node.textContent).toContain("Выбрать время");
    // Retained Next catalog uses ONLY its source CSS-module list/card/actions:
    // generic legacy consult-live classes give li/buttons the wrong flex,
    // gap and palette on real source-comparison screenshots.
    const sourceCatalog=node.querySelector('section[aria-labelledby="consultations-catalog-title"]');
    expect(sourceCatalog).not.toBeNull();
    const consultTabs=[...node.querySelectorAll<HTMLAnchorElement>(
      'nav[aria-label="Раздел консультаций"] a')];
    expect(consultTabs).toHaveLength(2);
    expect(consultTabs[0]?.getAttribute("aria-current")).toBe("page");
    expect(consultTabs[1]?.hasAttribute("aria-current")).toBe(false);
    expect(sourceCatalog?.querySelector("ul")?.classList.contains("consult-live-catalog")).toBe(false);
    expect(sourceCatalog?.querySelector(".consult-live-actions")).toBeNull();
    expect(node.querySelector(".consult-live-catalog-screen")).not.toBeNull();
    const publicProfile=sourceCatalog?.querySelector<HTMLAnchorElement>('a[href="/profile?username=trainer_a"]');
    expect(publicProfile?.textContent?.trim()).toBe("Подробнее о кинологе");
    // Original Next reuses CaramelButtonLink + PrimaryButtonLink, with the
    // same source card action class and native navigation semantics.
    expect(publicProfile?.dataset.gafusSharedButton).toBe("caramel");
    const sourceActionClass = publicProfile?.classList;
    expect(sourceActionClass?.length).toBeGreaterThanOrEqual(2);
    expect(node.textContent).not.toContain("Страница не найдена");
    const link=node.querySelector<HTMLAnchorElement>('a[href="/consultations/trainer1"]');
    expect(link).not.toBeNull();
    expect(link?.dataset.gafusSharedButton).toBe("primary");
    expect(link?.getAttribute("aria-label")).toBe("Выбрать время у кинолога Кинолог Анна");
    expect(link?.classList.length).toBeGreaterThanOrEqual(2);
    await act(async()=>link?.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,button:0})));
    await tick();
    // Source Next uses a full month calendar rather than the removed text-only list.
    expect(node.querySelector('section[aria-label="Календарь свободных слотов"]')).not.toBeNull();
    expect(node.textContent).toContain("Часовой пояс: МСК (UTC+3)");
    // Original Next initially selects the first calendar day, even when
    // the first published FREE slot is later. Explicitly choose the fixture
    // date to prove a real UI day selection reveals the correct time.
    const firstAllowedDay = node.querySelector<HTMLButtonElement>(
      'button[data-consultation-day-key][data-in-range="true"]');
    expect(firstAllowedDay).not.toBeNull();
    expect(firstAllowedDay?.getAttribute("data-selected")).toBe("true");
    const nextMonth=node.querySelector<HTMLButtonElement>(
      'button[aria-label="Следующий месяц"]');
    await act(async()=>nextMonth?.click());await tick();
    const availableDay=node.querySelector<HTMLButtonElement>(
      'button[data-consultation-day-key="2026-11-01"]');
    expect(availableDay?.disabled).toBe(false);
    await act(async()=>availableDay?.click());await tick();
    expect(node.textContent).toContain("11:00 - 11:45");
    expect(fetcher.mock.calls.some(([path])=>String(path).includes("includeBusy=1"))).toBe(true);
    // Source Next first verifies the physical slot through Hono; no
    // pre-verified booking link must be exposed by the calendar.
    expect([...node.querySelectorAll<HTMLButtonElement>("button")]
      .some(button=>!button.disabled&&button.textContent?.trim()==="Выбрать слот")).toBe(true);
    expect(node.querySelector('a[href="/consultations/cynologists/trainer1/slots/slot1"]')).toBeNull();
  });
  it("legacy my URL displays owner-bookings and cancellation control",async()=>{
    await mount("/consultations/my");
    const consultTabs=[...node.querySelectorAll<HTMLAnchorElement>(
      'nav[aria-label="Раздел консультаций"] a')];
    expect(consultTabs).toHaveLength(2);
    expect(consultTabs[0]?.hasAttribute("aria-current")).toBe(false);
    expect(consultTabs[1]?.getAttribute("aria-current")).toBe("page");
    expect(node.textContent).toContain("Мои консультации");
    expect(node.textContent).toContain("Рекс");
    const list=node.querySelector("section.next-my-consultations > ul");
    const card=list?.querySelector("li");
    expect(card?.querySelector('span[data-tone="success"]')?.textContent)
      .toBe("Подтверждена");
    expect(card?.textContent).toContain("Встреча подтверждена.");
    expect(card?.textContent).toContain("Кинолог Анна — ");
    expect(card?.textContent).toContain("01.11.2026");
    expect(card?.textContent).toContain("Секрет · Рекс");
    expect(card?.textContent).toContain("Перейти к видеовстрече");
    expect(card?.textContent).not.toContain("+79991234567");
    expect(card?.textContent).not.toContain("Секретная проблема");
    expect(node.querySelector('a[href="/consultations/call/booking1"]')).not.toBeNull();
    expect(node.textContent).not.toContain("Секретная проблема");
  });
  it("direct booked slot uses existing intake fields before any POST",async()=>{
    await mount("/consultations/cynologists/trainer1/slots/slot1");
    expect(node.textContent).toContain("Подтверждение консультации");
    expect(node.querySelector<HTMLInputElement>('input[name="clientOwnerName"]')).not.toBeNull();
    expect(node.querySelector("textarea")).not.toBeNull();
    expect(node.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(fetcher.mock.calls.every(c=>c[1]?.method!=="POST")).toBe(true);
  });
  it("original Next confirm deep-link preserves slotId in its booking form",async()=>{
    await mount("/consultations/trainer1/confirm?slotId=slot1");
    expect(node.textContent).toContain("Подтверждение консультации");
    expect(node.textContent).not.toContain("Страница не найдена");
    expect(fetcher.mock.calls.every(c=>c[1]?.method!=="POST")).toBe(true);
  });
  it("confirmed booking shows call link and cancelling posts once",async()=>{
    await mount("/consultations/my");
    const cancel=[...node.querySelectorAll("button")].find(x=>x.textContent?.includes("Отменить запись"));
    expect(cancel).not.toBeUndefined();
    await act(async()=>{cancel?.dispatchEvent(new MouseEvent("click",{bubbles:true}));});
    await tick();

    expect(fetcher.mock.calls.filter(c=>c[0]===
      "/api/v1/consultations/bookings/booking1/cancel"&&c[1]?.method==="POST")).toHaveLength(1);
  });
  it("owner cancellation requires actual /my GET to confirm CANCELLED_BY_USER",async()=>{
    await mount("/consultations/my");
    const cancel=[...node.querySelectorAll("button")].find(x=>x.textContent?.includes("Отменить запись"));
    await act(async()=>cancel?.click());await tick();

    expect(node.textContent).toContain("Отменена вами");
    expect(node.textContent).not.toContain("Проверить статус отмены");
    expect(node.textContent).not.toContain("Отменить запись");
    expect(fetcher.mock.calls.filter(c=>String(c[0]).includes("/consultations/my?"))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith("/cancel"))).toHaveLength(1);
  });
  it("lost cancellation ACK but committed booking is settled by owner GET with no replay",async()=>{
    cancellationAckLost=true;
    await mount("/consultations/my");
    const cancel=[...node.querySelectorAll("button")].find(x=>x.textContent?.includes("Отменить запись"));
    await act(async()=>cancel?.click());await tick();

    expect(node.textContent).toContain("Отменена вами");
    expect(node.textContent).not.toContain("Статус отмены неизвестен");
    expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith("/cancel"))).toHaveLength(1);
  });
  it("unconfirmed lost cancellation ACK blocks another POST until explicit GET",async()=>{
    cancellationEarlyDrop=true;
    await mount("/consultations/my");
    const cancel=[...node.querySelectorAll("button")].find(x=>x.textContent?.includes("Отменить запись"));
    await act(async()=>cancel?.click());await tick();

    expect(node.textContent).toContain("Статус отмены неизвестен");
    expect(node.querySelector<HTMLButtonElement>('button[class*="cancelBtn"]')?.disabled).toBe(true);
    expect(node.textContent).toContain("Проверить статус отмены");
    expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith("/cancel"))).toHaveLength(1);
    cancellationCommitted=true;
    const check=[...node.querySelectorAll("button")].find(x=>x.textContent?.trim()===
      "Проверить статус отмены");
    await act(async()=>check?.click());await tick();
    expect(node.textContent).toContain("Отменена вами");
    expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith("/cancel"))).toHaveLength(1);
  });
  it("Next immediate cancellation sends one POST despite rapid repeated clicks",async()=>{
    await mount("/consultations/my");
    const cancel=[...node.querySelectorAll("button")].find(x=>x.textContent?.trim()===
      "Отменить запись");
    await act(async()=>{
      cancel?.click();
      cancel?.click();
    });
    await tick();
    expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith("/cancel"))).toHaveLength(1);
    expect(node.textContent).toContain("Отменена вами");
  });
  it("real Vite StrictMode setup/cleanup replay must not silently revoke same-owner booking",async()=>{
    journeyMode=true;
    await mount("/consultations/cynologists/trainer1/slots/slot1",false,true);
    await fillConsultationForm();
    const verifies=fetcher.mock.calls.filter(([path])=>String(path).endsWith("/verify"));
    const writes=fetcher.mock.calls.filter(([path])=>path==="/api/v1/consultations/book");
    expect(verifies).toHaveLength(1);
    expect(writes).toHaveLength(1);
    expect(node.textContent).toContain("Мои консультации");
    expect(node.textContent).not.toContain("Сессия изменилась");
  });
  it("normal Next slot→verify→book→/my uses real connected endpoint contracts",async()=>{
    journeyMode=true;
    await mount("/consultations/cynologists/trainer1/slots/slot1");
    await fillConsultationForm();
    expect(fetcher.mock.calls.filter(([path])=>String(path).endsWith("/verify"))).toHaveLength(1);
    const bookCalls=fetcher.mock.calls.filter(([path])=>path==="/api/v1/consultations/book");
    expect(bookCalls).toHaveLength(1);
    expect(JSON.parse(String(bookCalls[0]![1]?.body))).toMatchObject({
      slotId:"slot1",petName:"Рекс",petGender:"MALE",
      idempotencyKey:"12345678-1234-4567-89ab-123456789abc",
    });
    expect(node.textContent).toContain("Мои консультации");
    expect(node.textContent).toContain("Рекс");
    expect(fetcher.mock.calls.some(([path])=>String(path).includes("/consultations/my?"))).toBe(true);
  });
  it("lost booking ACK uses /book/lookup FOUND then owner /my, no replay",async()=>{
    journeyMode=true;bookOutcome="lost_ack";
    await mount("/consultations/cynologists/trainer1/slots/slot1");
    await fillConsultationForm();
    expect(node.textContent).toContain("Результат записи неизвестен");
    const lookup=[...node.querySelectorAll("button")].find(x=>x.textContent?.trim()===
      "Проверить результат записи");
    expect(lookup).toBeDefined();
    await act(async()=>lookup?.click());await tick();
    expect(node.textContent).toContain("Рекс");
    expect(fetcher.mock.calls.filter(([path])=>path==="/api/v1/consultations/book")).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([path])=>path==="/api/v1/consultations/book/lookup"))
      .toHaveLength(1);
  });
  it("server 402 subscription rejection never reports booked status",async()=>{
    journeyMode=true;bookOutcome="no_subscription";
    await mount("/consultations/cynologists/trainer1/slots/slot1");
    await fillConsultationForm();
    expect(node.textContent).toContain("Для записи требуется подходящая подписка");
    expect(node.textContent).toContain("Бронирование не создано");
    expect(node.textContent).not.toContain("Проверить результат записи");
    expect(fetcher.mock.calls.filter(([path])=>path==="/api/v1/consultations/book")).toHaveLength(1);
    expect(bookingCreated).toBe(false);
  });
  it("unauthenticated visitor is redirected to landing without any private GET",async()=>{
    await mount("/consultations",true);
    expect(window.location.pathname).toBe("/");
    expect(node.textContent).toContain("Начать заниматься");
    expect(node.textContent).not.toContain("Страница не найдена");
    expect(node.textContent).not.toContain("Кинолог Анна");
    expect(fetcher.mock.calls.filter(([path])=>
      String(path).startsWith("/api/v1/consultations/"))).toHaveLength(0);
  });
  it("unknown published specialist never fetches foreign slots",async()=>{
    await mount("/consultations/stranger");
    expect(node.textContent).toContain("Кинолог не найден");
    expect(fetcher.mock.calls.some(c=>String(c[0]).includes("stranger/slots"))).toBe(false);
  });
});
