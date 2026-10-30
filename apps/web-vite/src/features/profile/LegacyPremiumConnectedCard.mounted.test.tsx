// @vitest-environment jsdom
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {LegacyPremiumConnectedCard} from "./LegacyPremiumConnectedCard";
import type {AppSubscriptionStatusDto} from "@gafus/types";
const base:AppSubscriptionStatusDto={
  hasActiveSubscription:false,paidAt:null,activeUntil:null,isTrial:false,trialEndsAt:null,
  isLifetime:false,provider:null,planCode:null,status:null,cancelAtPeriodEnd:false,
  hasSavedPaymentMethod:false,paymentMethodLast4:null,paymentMethodTitle:null,
  nextChargeAt:null,yookassaTrialAvailable:false,yookassaTrialDays:0,
  yookassaTrialUnavailableReason:null,
};
const success=(row:AppSubscriptionStatusDto)=>new Response(JSON.stringify({success:true,data:row}),{
  status:200,headers:{"content-type":"application/json"},
});
let element:HTMLDivElement,root:Root,query:QueryClient,owner:boolean;
let fetcher:ReturnType<typeof vi.fn>;
const tick=()=>act(async()=>new Promise(ok=>setTimeout(ok,20)));
const render=async(id="owner-A")=>{
  await act(async()=>root.render(<QueryClientProvider client={query}>
    <LegacyPremiumConnectedCard ownerId={id} isCurrent={()=>owner}/>
  </QueryClientProvider>));
  await tick();
};
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  owner=true;element=document.createElement("div");document.body.append(element);
  root=createRoot(element);
  query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  fetcher=vi.fn(async()=>success(base));vi.stubGlobal("fetch",fetcher);
});
afterEach(async()=>{
  await act(async()=>root.unmount());query.clear();element.remove();vi.unstubAllGlobals();
});
describe("WEB1 genuine owner-only premium snapshot, no checkout side effects",()=>{
  it("projects inactive Core status via registered Hono GET, no guessed price/payment call",async()=>{
    await render();
    expect(element.textContent).toContain("Неактивна");
    expect(element.textContent).toContain("Откройте больше возможностей");
    expect(element.querySelector('img[src="/images/profile-premium-mascot.webp"]')).not.toBeNull();
    expect(element.textContent).not.toContain("₽");
    expect(element.querySelector('a[href="/subscription"]')?.textContent)
      .toContain("Оформить подписку");
    expect(element.querySelector("button")?.textContent).toContain("Обновить статус");
    expect(fetcher.mock.calls.map(call=>[call[0],(call[1] as RequestInit)?.method])).toEqual([
      ["/api/v1/app-subscription/status","GET"],
    ]);
  });
  it("shows actual active lifetime partner access from Core without inventing a payment",async()=>{
    fetcher.mockImplementationOnce(async()=>success({...base,hasActiveSubscription:true,
      isLifetime:true,provider:"MANUAL",status:"ACTIVE",planCode:"MONTHLY",
      paymentMethodTitle:"Партнёрская программа"}));
    await render();
    expect(element.textContent).toContain("Активна");
    expect(element.textContent).toContain("Бесплатный бессрочный доступ участника партнёрской программы");
    expect(element.textContent).not.toContain("Оплачено");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires an explicit confirmation before stopping real YooKassa renewal",async()=>{
    let canceled=false;
    fetcher.mockImplementation(async(path:string)=>{
      if(path==="/api/v1/app-subscription/yookassa/cancel"){
        canceled=true;
        return success({...base,hasActiveSubscription:true,provider:"YOOKASSA",
          status:"ACTIVE",planCode:"MONTHLY",hasSavedPaymentMethod:false,
          cancelAtPeriodEnd:true});
      }
      return success({...base,hasActiveSubscription:true,provider:"YOOKASSA",
        status:"ACTIVE",planCode:"MONTHLY",hasSavedPaymentMethod:!canceled,
        cancelAtPeriodEnd:canceled});
    });
    await render();
    const button=[...element.querySelectorAll<HTMLButtonElement>("button")]
      .find(item=>item.textContent?.includes("Удалить способ оплаты"));
    expect(button?.disabled).toBe(true);
    expect(fetcher.mock.calls.map(call=>call[0]))
      .not.toContain("/api/v1/app-subscription/yookassa/cancel");
    const confirmation=element.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(confirmation).not.toBeNull();
    await act(async()=>confirmation!.click());
    expect(button?.disabled).toBe(false);
    await act(async()=>button!.click());
    await tick();
    const posts=fetcher.mock.calls.filter(call=>
      call[0]==="/api/v1/app-subscription/yookassa/cancel");
    expect(posts).toHaveLength(1);
    expect((posts[0]?.[1] as RequestInit)?.method).toBe("POST");
    expect(element.textContent).toContain("Отключено");
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("renders persisted UTC date in Moscow time for a real active snapshot",async()=>{
    fetcher.mockImplementationOnce(async()=>success({...base,hasActiveSubscription:true,
      provider:"APPLE",status:"ACTIVE",planCode:"MONTHLY",paidAt:"2026-10-25T13:00:00.000Z",
      activeUntil:"2026-11-25T13:00:00.000Z",paymentMethodTitle:"Apple"}));
    await render();
    expect(element.textContent).toContain("25.10.2026");
    expect(element.textContent).toContain("Управляется в App Store");
    expect(element.textContent).toContain("25.11.2026");
  });
  it("refuses pending response after current owner changes",async()=>{
    let resolve!:(value:Response)=>void;
    fetcher.mockImplementationOnce(()=>new Promise<Response>(ok=>{resolve=ok;}));
    await render();
    owner=false;await render();
    await act(async()=>resolve(success({...base,hasActiveSubscription:true})));
    expect(element.textContent).toBe("");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("explicit 503 shows retry, no accidental provider mutation",async()=>{
    fetcher.mockImplementationOnce(async()=>new Response(JSON.stringify({success:false,
      error:"PRIVATE_SERVER_UNAVAILABLE"}),{status:503}));
    await render();
    expect(element.getAttribute("role")).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain("Не удалось загрузить");
    const button=element.querySelector<HTMLButtonElement>("button");
    await act(async()=>button?.click());await tick();
    expect(element.textContent).toContain("Неактивна");
    expect(fetcher.mock.calls.every(call=>(call[1] as RequestInit)?.method==="GET")).toBe(true);
  });
});
