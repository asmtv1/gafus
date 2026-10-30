import {describe,expect,it} from "vitest";
import {projectSubscriptionSnapshot,displaySubscriptionDate,planLabel}
  from "./subscriptionReadMock";
export const status={
  hasActiveSubscription:true,canUseCynologistChat:true,
  canBookConsultations:false,isLifetime:false,isTrial:false,
  activeUntil:"2026-11-17T00:00:00.000Z",
  nextChargeAt:"2026-11-17T00:00:00.000Z",
  cancelAtPeriodEnd:false,provider:"YOOKASSA",
  planCode:"MONTHLY",status:"ACTIVE",
  paymentMethodLast4:"1234",paymentMethodTitle:"SECRETCARD",
  appleAccountToken:"SECRET_APPLE",
};
export const plan={
  code:"MONTHLY",title:"Поддержка в чате",label:"Поддержка в чате",
  currency:"RUB",intervalDays:30,yookassaPriceRub:1465,
  enabled:true,consultationBookingIncluded:false,cynologistChatIncluded:true,
  badge:"POPULAR",appleProductId:"SECRET_APPLE_PRODUCT",
};
export const offer={
  plans:[plan],yookassaPlans:[plan],applePlan:null,
  appleAppAccountToken:"SECRET_TOKEN",
  promoCode:{entryEnabled:true,eligible:true},
  savedRegistrationPromoCode:{code:"SECRET_PROMO",status:"INACTIVE"},
};
describe("AG2 source-only subscription DTO projection",()=>{
  it("S01 server prices and capabilities, no PII/payment/token/cache leakage",()=>{
    const p=projectSubscriptionSnapshot({status,offer});
    expect(p.offer.plans[0].priceRub).toBe(1465);
    expect(p.status.canBookConsultations).toBe(false);
    expect(p.offer.savedPromoStatus).toBe("INACTIVE");
    expect(JSON.stringify(p)).not.toMatch(/SECRET|1234/);
  });
  it("S02 empty public tariffs supported",()=>{
    expect(projectSubscriptionSnapshot({status:{...status,
      hasActiveSubscription:false,status:null,planCode:null,
      nextChargeAt:null,activeUntil:null},offer:{...offer,
        yookassaPlans:[]}}).offer.plans).toEqual([]);
  });
  it("S03 only enabled public plans; cannot show backend disabled",()=>{
    const p=projectSubscriptionSnapshot({status,offer:{
      ...offer,yookassaPlans:[{...plan,enabled:false},
        {...plan,code:"THREE_MONTHS",yookassaPriceRub:2470}],
    }});
    expect(p.offer.plans.map(x=>x.code)).toEqual(["THREE_MONTHS"]);
  });
  it("S04 invalid, duplicate or forged pricing fails closed",()=>{
    for(const other of [
      {yookassaPlans:[{...plan,yookassaPriceRub:-100}]},
      {yookassaPlans:[plan,plan]},
      {yookassaPlans:[{...plan,currency:"USD"}]},
      {yookassaPlans:[{...plan,code:"FOREIGN"}]},
      {yookassaPlans:[{...plan,intervalDays:0}]},
      {yookassaPlans:[{...plan,enabled:"yes"}]},
    ])expect(()=>projectSubscriptionSnapshot({status,offer:{...offer,...other}}))
      .toThrow();
  });
  it("S05 reject invalid status/entitlement/expired dates",()=>{
    for(const other of [
      {hasActiveSubscription:"true"},{canUseCynologistChat:"yes"},
      {activeUntil:"2026-99-88"},{planCode:"SOME_NEW_PLAN"},
      {status:"WRONG"},{hasActiveSubscription:true,status:"CANCELED"},
      {isLifetime:true,hasActiveSubscription:false},
    ])expect(()=>projectSubscriptionSnapshot({
      status:{...status,...other},offer,
    })).toThrow();
  });
  it("S06 format status label and timezone from server date",()=>{
    expect(planLabel("MONTHLY")).toBe("Поддержка в чате");
    expect(planLabel("TWO_WEEKS")).toBe("Самостоятельный");
    expect(displaySubscriptionDate("2026-11-17T00:00:00.000Z"))
      .toContain("2026");
  });
});
