// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProfileOverview} from "../profile/ProfileOverview";
import {SubscriptionOptInHarness} from "./SubscriptionOptInHarness";
import {ApiError} from "../../shared/api/client";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {SubscriptionReadLoader} from "./subscriptionReadMock";
const status={
  hasActiveSubscription:true,canUseCynologistChat:true,
  canBookConsultations:false,isLifetime:false,isTrial:false,
  activeUntil:"2026-11-17T00:00:00.000Z",
  nextChargeAt:"2026-11-17T00:00:00.000Z",
  cancelAtPeriodEnd:false,provider:"YOOKASSA",planCode:"MONTHLY",status:"ACTIVE",
  paymentMethodTitle:"SECRET_CARD",paymentMethodLast4:"7777",
};
const plan={
  code:"MONTHLY",title:"Поддержка в чате",label:"Месячный",
  currency:"RUB",intervalDays:30,yookassaPriceRub:1465,
  enabled:true,consultationBookingIncluded:false,cynologistChatIncluded:true,
  badge:"POPULAR",appleProductId:null,
};
const offer={
  plans:[plan],yookassaPlans:[plan],applePlan:null,
  appleAppAccountToken:"SECRET_APPLE",promoCode:{
    entryEnabled:false,eligible:false,
  },savedRegistrationPromoCode:null,
};
const data=()=>({status,offer});
const deferred=<T,>()=>{
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(ok=>{resolve=ok;});
  return {promise,resolve};
};
let root:Root,host:HTMLDivElement,cache:QueryClient;
let loader:ReturnType<typeof vi.fn<SubscriptionReadLoader>>;
async function flush(){await act(async()=>{await new Promise(ok=>setTimeout(ok,15));});}
async function render(component:React.ReactNode){
  await act(async()=>root.render(
    <QueryClientProvider client={cache}>{component}</QueryClientProvider>
  ));await flush();
}
async function mount(enabled=true,withLoader=true){
  await render(<ProfileOverview userId="A"
    showSubscriptionOptIn={enabled}
    subscriptionReadLoader={withLoader?loader:undefined}/>);
}
async function harness(userId:string|null,enabled=true){
  await render(<SubscriptionOptInHarness enabled={enabled}
    userId={userId} loadSnapshot={loader}/>);
}
async function click(text:string){
  const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent?.trim()===text);
  expect(button,"missing "+text).toBeTruthy();
  await act(async()=>button?.click());await flush();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const fetch=vi.fn((path:string,options:{method?:string})=>{
    if(path!=="/api/v1/user/profile"||options?.method!=="GET")
      throw Error("UNAUTHORIZED_HTTP_"+path);
    return Promise.resolve(new Response(JSON.stringify({success:true,
      data:{id:"A",username:"ownerA",profile:{
        fullName:"Профиль GAFUS",city:"Москва",about:null,
      }},
    }),{status:200}));
  });
  vi.stubGlobal("fetch",fetch);
  cache=new QueryClient({defaultOptions:{queries:{
    retry:false,refetchOnWindowFocus:false,
  }}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{
    id:"A",username:"ownerA",role:"USER",
  });
  loader=vi.fn<SubscriptionReadLoader>().mockResolvedValue(data());
  host=document.createElement("div");document.body.appendChild(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();
  vi.unstubAllGlobals();
});
describe("AG2 real mounted subscription source/fixture opt-in",()=>{
  it("C01 disabled renders no subscription entry or loader",async()=>{
    await mount(false);
    expect(host.textContent).not.toContain("Моя подписка");
    expect(loader).not.toHaveBeenCalled();
  });
  it("C02 requires explicit fixture, no default Hono GET",async()=>{
    await mount(true,false);
    expect(host.textContent).not.toContain("Моя подписка");
    expect(loader).not.toHaveBeenCalled();
  });
  it("C03 profile -> status -> server price -> expand -> back",async()=>{
    await mount();await click("Моя подписка");
    expect(loader).toHaveBeenCalledExactlyOnceWith("A");
    expect(host.textContent).toContain("Подписка активна");
    expect(host.textContent).toContain("1 465");
    expect(host.textContent).toContain("Поддержка в чате");
    expect(host.textContent).not.toContain("SECRET");
    expect(host.textContent).not.toContain("7777");
    await click("Что входит");
    expect(host.textContent).toContain("Запись на консультацию: Не включена");
    await click("Скрыть возможности");
    await click("Вернуться в профиль");
    expect(host.textContent).toContain("Посмотреть доступ и тарифы");
    expect(vi.mocked(globalThis.fetch).mock.calls.map(([url])=>url)).toEqual([
        "/api/v1/user/profile", "/api/v1/feed/status",
      ]);
  });
  it("C04 pending and empty plans are real UI states",async()=>{
    const deferredResponse=deferred<{status:unknown;offer:unknown}>();
    loader.mockReturnValueOnce(deferredResponse.promise);
    await harness("A");await click("Моя подписка");
    expect(host.textContent).toContain("Загружаем данные подписки");
    await act(async()=>deferredResponse.resolve({
      status:{...status,hasActiveSubscription:false,status:null,
        planCode:null,activeUntil:null,nextChargeAt:null},
      offer:{...offer,yookassaPlans:[]},
    }));await flush();
    expect(host.textContent).toContain("Сейчас нет активной подписки");
    expect(host.textContent).toContain("Тарифы сейчас недоступны");
  });
  it.each([[401,"Сессия завершена"],[403,"недоступен"],
    [500,"Не удалось"]])(
    "C05-07 bounded status %d, manual retry not auto",async(code,msg)=>{
      loader.mockRejectedValueOnce(new ApiError(code,"SECRET_STACK"))
        .mockResolvedValueOnce(data());
      await harness("A");await click("Моя подписка");
      expect(host.textContent).toContain(msg);
      expect(host.textContent).not.toContain("SECRET_STACK");
      expect(loader).toHaveBeenCalledTimes(1);
      await click("Повторить");
      expect(loader).toHaveBeenCalledTimes(2);
      expect(host.textContent).toContain("Подписка активна");
    });
  it("C08 malformed server price fails closed, not showing 0 ₽",async()=>{
    loader.mockResolvedValueOnce({
      status,offer:{...offer,yookassaPlans:[{...plan,yookassaPriceRub:-1}]},
    });
    await harness("A");await click("Моя подписка");
    expect(host.getElementsByClassName("subscription-plan-card")).toHaveLength(0);
    expect(host.textContent).toContain("Не удалось загрузить");
  });
  it("C09 A->B pending reply cannot show old entitlement/price",async()=>{
    const pending=deferred<{status:unknown;offer:unknown}>();
    loader.mockReturnValueOnce(pending.promise);
    await harness("A");await click("Моя подписка");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"ownerB",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>pending.resolve(data()));await flush();
    expect(host.textContent).not.toContain("Подписка активна");
    expect(host.textContent).not.toContain("1465");
  });
  it("C10 A->B->A owner ABA cannot restore old prices",async()=>{
    await harness("A");await click("Моя подписка");
    expect(host.textContent).toContain("Подписка активна");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"ownerB",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Подписка активна");
  });
  it("C11 logout/cache.clear prevents private status from remaining",async()=>{
    await harness("A");await click("Моя подписка");
    await act(async()=>cache.clear());
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Подписка активна");
  });
  it("C12 guest/no owner displays sign in, without loader",async()=>{
    await harness(null);
    expect(host.textContent).toBe("");
    expect(loader).not.toHaveBeenCalled();
  });
  it("C13 price, life access and no auto-renew from DTO only",async()=>{
    loader.mockResolvedValueOnce({
      status:{...status,isLifetime:true,nextChargeAt:null,activeUntil:null,
        provider:"MANUAL",planCode:"THREE_MONTHS",cancelAtPeriodEnd:true},
      offer,
    });
    await harness("A");await click("Моя подписка");
    expect(host.textContent).toContain("Пожизненный доступ");
    expect(host.textContent).toContain("Автопродление отключено");
    expect(host.textContent).not.toContain("Следующее списание");
  });
});
