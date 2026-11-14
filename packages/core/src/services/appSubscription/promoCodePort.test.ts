import { beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
function stub() {
  return {
    userHasSuccessfulPromoBlockingPayment:vi.fn(async (_userId:string)=>false),
    readPromoSettingsRow:vi.fn(async()=>null),
    readPromoCodeByNormalizedCode:vi.fn(async (_code:string)=>null),
    isUniquePromoCodeError:vi.fn((_error:unknown)=>false),
    withPromoCodeRecordsTransaction:vi.fn(async <T>(action:(rows:never)=>Promise<T>)=>action({} as never)),
  };
}
describe("subscription promo SQL transaction port",()=>{
  it("fails closed for eligibility/creating a promotion without DB composition",async()=>{
    const svc=await import("./promoCodeService");
    await expect(svc.isAppSubscriptionPromoCodeEligible("owner-1"))
      .rejects.toThrow("SUBSCRIPTION_PROMO_PORT_UNBOUND");
    await expect(svc.createAppSubscriptionPromoCode({
      code:"SUMMER26",discountPercent:10,isActive:true,actorId:"admin-1",
    })).rejects.toThrow("SUBSCRIPTION_PROMO_PORT_UNBOUND");
  });
  it("preserves one-way successful YooKassa payment eligibility blocker",async()=>{
    const port=await import("./promoCodePort");const svc=await import("./promoCodeService");
    const p=stub();port.registerSubscriptionPromoPort(p);
    await expect(svc.isAppSubscriptionPromoCodeEligible("owner-1")).resolves.toBe(true);
    p.userHasSuccessfulPromoBlockingPayment.mockResolvedValueOnce(true);
    await expect(svc.isAppSubscriptionPromoCodeEligible("owner-1")).resolves.toBe(false);
    expect(p.userHasSuccessfulPromoBlockingPayment).toHaveBeenCalledTimes(2);
    expect(p.userHasSuccessfulPromoBlockingPayment).toHaveBeenNthCalledWith(2,"owner-1");
  });
  it("prevents hot replacement of SERIALIZABLE DB transaction provider",async()=>{
    const port=await import("./promoCodePort");const p=stub();port.registerSubscriptionPromoPort(p);
    port.registerSubscriptionPromoPort(p);
    expect(()=>port.registerSubscriptionPromoPort(stub()))
      .toThrow("SUBSCRIPTION_PROMO_PORT_ALREADY_BOUND");
  });
});
