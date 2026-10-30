import { afterEach,describe,expect,it,vi } from "vitest";
import type { ApiError } from "../../shared/api/client";
import { checkedPaymentUrl,createCheckoutPayment,previewCheckoutPromo,
  validatePromoPreview,validatedCheckoutPlans,type CheckoutPlan } from "./checkoutApi";
import type { AppSubscriptionOfferDto } from "../../../../../packages/core/src/services/appSubscription/types";
const plan:CheckoutPlan={code:"MONTHLY",title:"Месяц",label:"Месяц",intervalDays:30,
  currency:"RUB",yookassaPriceRub:1465,enabled:true,appleProductId:null,
  offlineCourseDownloadIncluded:true,cynologistChatIncluded:true,
  consultationBookingIncluded:true,promoCodeEligible:true,badge:"POPULAR",savingsRub:null};
const offer={yookassaPlans:[plan]} as AppSubscriptionOfferDto;
const promo={code:"PROMO10",revision:5,planCode:"MONTHLY" as const,discountPercent:10,
  originalPriceRub:1465,discountedPriceRub:1318.5,renewalPriceRub:1465,intervalDays:30,
  currency:"RUB" as const};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify({success:status===200,data}),{
  status,headers:{"content-type":"application/json"},
});
afterEach(()=>vi.unstubAllGlobals());
describe("WEB Next subscription checkout Hono bridge",()=>{
  it("selects only verified server plans, never invents fallback prices",()=>{
    expect(validatedCheckoutPlans(offer)).toEqual([plan]);
    expect(()=>validatedCheckoutPlans({...offer,yookassaPlans:[plan,plan]})).toThrow();
    expect(()=>validatedCheckoutPlans({
      ...offer,yookassaPlans:[{...plan,yookassaPriceRub:-1}],
    })).toThrow();
    expect(()=>validatedCheckoutPlans({} as AppSubscriptionOfferDto)).toThrow();
  });
  it("accepts only HTTPS redirect links with no credentials",()=>{
    expect(checkedPaymentUrl("https://yoomoney.ru/checkout/a")).toBe("https://yoomoney.ru/checkout/a");
    for(const url of ["javascript:alert(1)","http://localhost:9000/", "//evil", "https://a:b@example.org/"])
      expect(()=>checkedPaymentUrl(url)).toThrow();
  });
  it("validates promo plan/revision/server price before showing discount",()=>{
    expect(validatePromoPreview(promo,plan)).toEqual(promo);
    expect(()=>validatePromoPreview({...promo,revision:0},plan)).toThrow();
    expect(()=>validatePromoPreview({...promo,originalPriceRub:10},plan)).toThrow();
    expect(()=>validatePromoPreview({...promo,discountedPriceRub:2000},plan)).toThrow();
  });
  it("POSTs bound promo and chosen plan to same-origin Core, no credentials/secrets",async()=>{
    const fetcher=vi.fn(async(_path:string,_options?:RequestInit)=>
      reply({confirmationUrl:"https://yookassa.ru/pay/a",localSubscriptionId:"sub"}));
    vi.stubGlobal("fetch",fetcher);
    expect(await createCheckoutPayment("MONTHLY",promo)).toBe("https://yookassa.ru/pay/a");
    const [path,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(path).toBe("/api/v1/app-subscription/yookassa/start");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(JSON.parse(String(options.body))).toEqual({planCode:"MONTHLY",
      promoCode:{code:"PROMO10",revision:5}});
    expect(String(options.body)).not.toMatch(/secret|shopId|userId/);
  });
  it("scopes consultation payment return to a verified trainer path",async()=>{
    const fetcher=vi.fn(async(_path:string,_options?:RequestInit)=>reply({
      confirmationUrl:"https://yookassa.ru/pay/a",localSubscriptionId:"sub",
    }));
    vi.stubGlobal("fetch",fetcher);
    const url=await createCheckoutPayment("THREE_MONTHS",undefined,"/consultations/trainer1");
    expect(url).toBe("https://yookassa.ru/pay/a");
    const body=JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      planCode:"THREE_MONTHS",returnPath:"/consultations/trainer1",
    });
    for(const bad of ["//evil","/consultations/../admin",
      "/consultations/trainer1?next=https://evil.example","https://evil.example"]) {
      await expect(createCheckoutPayment("THREE_MONTHS",undefined,bad)).rejects.toThrow(
        "Некорректный адрес возврата",
      );
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preview sends no payment POST and surfaces exact API error",async()=>{
    const fetcher=vi.fn(async(_path:string,_options?:RequestInit)=>reply(promo));vi.stubGlobal("fetch",fetcher);
    expect(await previewCheckoutPromo(plan,"PROMO10")).toEqual(promo);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/app-subscription/promo-code/preview");
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({success:false,code:"PROMO_CODE_CHANGED",
      error:"Условия изменились"}),{status:409}));
    await expect(previewCheckoutPromo(plan,"PROMO10")).rejects.toMatchObject({
      status:409,code:"PROMO_CODE_CHANGED",
    } satisfies Partial<ApiError>);
  });
});
