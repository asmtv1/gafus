// @vitest-environment jsdom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { SubscriptionCheckout } from "./SubscriptionCheckout";
const plan={code:"MONTHLY",title:"Месячная подписка",label:"Месяц",intervalDays:30,
  currency:"RUB",yookassaPriceRub:1465,enabled:true,appleProductId:null,
  offlineCourseDownloadIncluded:true,consultationBookingIncluded:false,
  cynologistChatIncluded:true,promoCodeEligible:true,badge:"POPULAR",savingsRub:null};
const offer={yookassaPlans:[plan],promoCode:{entryEnabled:true,eligible:true},
  savedRegistrationPromoCode:null};
const status={hasActiveSubscription:false};
const success=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
let root:Root,host:HTMLElement,cache:QueryClient,fetcher:ReturnType<typeof vi.fn>;
const tick=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,15)));
async function mount(search=""){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <SubscriptionCheckout ownerId="owner1" search={search}/>
  </QueryClientProvider>));
  await tick();await tick();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  fetcher=vi.fn(async(path:string)=>success(path.endsWith("/offer")?offer:status));
  vi.stubGlobal("fetch",fetcher);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
});
describe("Next Web checkout mounted acceptance",()=>{
  it("renders server-priced tariff, no charge on render or selection",async()=>{
    await mount();
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(1);
    expect(host.textContent).toContain("Больше понимания. Больше прогресса.");
    expect(host.textContent).not.toContain("Запись на консультацию — это доступ к бронированию");
    expect(host.querySelector(".subscription-consultation-note")).toBeNull();
    expect(host.textContent).toContain("Месячная подписка");
    expect(host.querySelector("button.subscription-pay")?.textContent).toContain("Оплатить 1 465 ₽ по СБП");
    expect(host.querySelector<HTMLImageElement>("button.subscription-pay .subscription-sbp-logo")?.getAttribute("src"))
      .toBe("/images/sbp-logo.svg");
    expect(fetcher.mock.calls.map(([path,options])=>[path,options?.method])).toEqual([
      ["/api/v1/app-subscription/offer","GET"],
      ["/api/v1/app-subscription/status","GET"],
    ]);
    await act(async()=>host.querySelector<HTMLButtonElement>('[role="radio"]')?.click());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed on malformed offers without rendering payment button",async()=>{
    fetcher.mockImplementation(async(path:string)=>success(path.endsWith("/offer")?
      {...offer,yookassaPlans:[{...plan,yookassaPriceRub:-1}]}:status));
    await mount();
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(host.querySelector("button.subscription-pay")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("некорректное предложение");
  });
  it("does not POST while a typed promo has not been server-validated",async()=>{
    await mount();
    const input=host.querySelector<HTMLInputElement>("#subscription-promo-code")!;
    await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
      setter.call(input,"PROMO10");input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await act(async()=>host.querySelector<HTMLButtonElement>("button.subscription-pay")?.click());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Сначала примените промокод");
  });
  it("shows validated discount, renewal terms, and lets the buyer change promo", async()=>{
    const promoOffer={...offer,savedRegistrationPromoCode:{code:"GAFUS-10-1488",status:"ACTIVE"}};
    const validatedPromo={code:"GAFUS-10-1488",revision:1,planCode:"MONTHLY",
      discountPercent:10,originalPriceRub:1465,discountedPriceRub:1318.5,
      renewalPriceRub:1465,intervalDays:30,currency:"RUB"};
    fetcher.mockImplementation(async(path:string)=>{
      if(path.endsWith("/offer"))return success(promoOffer);
      if(path.endsWith("/preview"))return success(validatedPromo);
      return success(status);
    });
    await mount();
    expect(host.querySelector(".subscription-promo-confirmation")?.textContent)
      .toContain("Промокод применён");
    expect(host.querySelector(".subscription-promo-confirmation")?.textContent)
      .toContain("GAFUS-10-1488");
    const savings=host.querySelector(".subscription-promo-savings")?.textContent??"";
    expect(savings).toContain("146,50");
    expect(savings).toContain("−10%");
    const prices=host.querySelector(".subscription-promo-prices")?.textContent??"";
    expect(prices).toContain("1 465");
    expect(prices).toContain("1 318,50");
    expect(host.querySelector(".subscription-promo-renewal")?.textContent).toContain("1 465");
    expect(host.querySelector(".subscription-pay")?.textContent).toContain("Оплатить 1 318,50 ₽ по СБП");
    expect(host.querySelector<HTMLInputElement>("#subscription-promo-code")).toBeNull();
    expect(fetcher.mock.calls.map(([path])=>path)).not.toContain("/api/v1/app-subscription/yookassa/start");
    await act(async()=>host.querySelector<HTMLButtonElement>(".subscription-promo-change")?.click());
    expect(host.querySelector(".subscription-promo-confirmation")).toBeNull();
    expect(host.querySelector(".subscription-promo-result")).toBeNull();
    expect(host.querySelector<HTMLInputElement>("#subscription-promo-code")?.value).toBe("");
    expect(host.querySelector(".subscription-pay")?.textContent).toContain("Оплатить 1 465 ₽ по СБП");
  });
  it("consultation checkout only sells the eligible plan with real price and promo",async()=>{
    const basic={...plan,code:"TWO_WEEKS",title:"Самостоятельный",
      yookassaPriceRub:1185,promoCodeEligible:false,consultationBookingIncluded:false};
    const full={...plan,code:"THREE_MONTHS",title:"Полное сопровождение",
      yookassaPriceRub:2470,consultationBookingIncluded:true};
    fetcher.mockImplementation(async(path:string)=>success(path.endsWith("/offer")
      ? {...offer,yookassaPlans:[basic,plan,full]}:status));
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <SubscriptionCheckout ownerId="owner1" embedded context="consultation"
        returnPath="/consultations/trainer1" />
    </QueryClientProvider>));
    await tick();await tick();
    expect(host.textContent).toContain("Откройте запись на консультацию");
    expect(host.querySelectorAll(".consultation-paywall-plan")).toHaveLength(1);
    expect(host.textContent).toContain("2 470");
    expect(host.querySelectorAll(".subscription-plan")).toHaveLength(0);
    expect(host.querySelector(".subscription-pay")?.textContent)
      .toContain("Оплатить 2 470 ₽ по СБП");
    expect(host.querySelector("#subscription-promo-code")).not.toBeNull();
    expect(fetcher.mock.calls.every(([,init])=>init?.method==="GET")).toBe(true);
  });
  it("consultation checkout fails closed without booking entitlement",async()=>{
    fetcher.mockImplementation(async(path:string)=>success(path.endsWith("/offer")?offer:status));
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <SubscriptionCheckout ownerId="owner1" embedded context="consultation"
        returnPath="/consultations/trainer1" />
    </QueryClientProvider>));
    await tick();await tick();
    expect(host.textContent).toContain("Тариф с записью на консультации сейчас недоступен");
    expect(host.querySelector(".subscription-pay")).toBeNull();
  });
  it("a paid return checks Core status, never creates another payment",async()=>{
    await mount("?paid=1");
    expect(host.textContent).toContain("Проверяем оплату");
    expect(fetcher.mock.calls.every(([path])=>path==="/api/v1/app-subscription/status")).toBe(true);
    expect(host.querySelector("button.subscription-pay")).toBeNull();
  });
  it("compares actual plan entitlements and updates the selected checkout price", async()=>{
    const basic={...plan,code:"TWO_WEEKS",title:"Самостоятельный",yookassaPriceRub:1185,
      offlineCourseDownloadIncluded:false,cynologistChatIncluded:false,
      consultationBookingIncluded:false,promoCodeEligible:false,badge:null};
    const full={...plan,code:"THREE_MONTHS",title:"Полное сопровождение",yookassaPriceRub:2470,
      consultationBookingIncluded:true,badge:null};
    fetcher.mockImplementation(async(path:string)=>success(path.endsWith("/offer")?
      {...offer,yookassaPlans:[basic,plan,full]}:status));
    await mount();
    const cards=Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(cards).toHaveLength(3);
    expect(cards.map(x=>x.querySelectorAll(".subscription-feature-disabled").length)).toEqual([3,1,0]);
    expect(cards[0]!.textContent).toContain("Не входит в тариф");
    expect(cards[1]!.textContent).toContain("Скачивание курсов в мобильном приложении");
    expect(host.querySelector(".subscription-order-heading")?.textContent).toContain("Месячная подписка");
    await act(async()=>cards[0]!.click());
    expect(cards[0]!.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelector(".subscription-order-heading")?.textContent).toContain("Самостоятельный");
    expect(host.querySelector(".subscription-pay")?.textContent).toContain("Оплатить 1 185 ₽ по СБП");
    expect(host.querySelector("#subscription-promo-code")).toBeNull();
    await act(async()=>cards[2]!.click());
    expect(cards[2]!.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelector(".subscription-pay")?.textContent).toContain("Оплатить 2 470 ₽ по СБП");
    expect(host.querySelector("#subscription-promo-code")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

});
