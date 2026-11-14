import { describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({ paid:vi.fn(async (_id:string)=>false) }));
vi.mock("@gafus/subscription-finance-server/promo-code-rows",()=>({
  userHasSuccessfulPromoBlockingPayment:m.paid,
  readPromoSettingsRow:vi.fn(async()=>null),
  readPromoCodeByNormalizedCode:vi.fn(async()=>null),
  withPromoCodeRecordsTransaction:vi.fn(async()=>{throw new Error("SERIALIZABLE_TX_TEST_ABORT");}),
  isUniquePromoCodeError:vi.fn(()=>false),
}));
describe("API subscription promo SERIALIZABLE SQL composition",()=>{
  it("installs one authoritative payment eligibility port and refuses substitution",async()=>{
    const core=await import("@gafus/core/services/appSubscription");
    await import("./install-promo-code-rows");
    await expect(core.isAppSubscriptionPromoCodeEligible("owner-A")).resolves.toBe(true);
    expect(m.paid).toHaveBeenCalledExactlyOnceWith("owner-A");
    expect(()=>core.registerSubscriptionPromoPort({} as never))
      .toThrow("SUBSCRIPTION_PROMO_PORT_ALREADY_BOUND");
    await expect(core.createAppSubscriptionPromoCode({
      code:"SUMMER26",discountPercent:25,isActive:true,actorId:"admin-A",
    })).rejects.toThrow("SERIALIZABLE_TX_TEST_ABORT");
  });
});
