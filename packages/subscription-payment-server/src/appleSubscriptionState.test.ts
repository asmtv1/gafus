import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>({
  $queryRaw:vi.fn(), appSubscription:{
    findFirst:vi.fn(),findMany:vi.fn(),findUniqueOrThrow:vi.fn(),create:vi.fn(),update:vi.fn(),
  },appSubscriptionPayment:{
    findUnique:vi.fn(),findFirst:vi.fn(),create:vi.fn(),updateMany:vi.fn(),
  },appSubscriptionEvent:{findUnique:vi.fn(),create:vi.fn()},
}));
vi.mock("@gafus/prisma",()=>({prisma:{$transaction:async (fn:(tx:typeof db)=>unknown)=>fn(db)}}));
import {persistVerifiedApplePurchase,persistVerifiedAppleServerState} from "./appleSubscriptionState";
const from=new Date("2026-11-01T00:00:00Z"),until=new Date("2026-12-01T00:00:00Z");
const purchase={
  userId:"owner",originalTransactionId:"chain",transactionId:"tx",productId:"premium",
  planCode:"MONTHLY" as const,periodStart:from,periodEnd:until,isRevoked:false,
  priceMilliunits:199000,currency:"RUB",
};
const previous=(status="ACTIVE",start=from,end=until)=>({
  userId:"owner",appleOriginalTransactionId:"chain",status,currentPeriodStart:start,currentPeriodEnd:end,
});
beforeEach(()=>{
  vi.resetAllMocks();vi.useRealTimers();
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
  db.appSubscription.findFirst.mockResolvedValue(null);
  db.appSubscription.findMany.mockResolvedValue([{id:"sub",userId:"owner",user:{appleAppAccountToken:"owner-token"}}]);
  db.appSubscription.create.mockResolvedValue({id:"sub"});
  db.appSubscriptionPayment.findUnique.mockResolvedValue(null);
  db.appSubscriptionPayment.findFirst.mockResolvedValue(null);
  db.appSubscriptionEvent.findUnique.mockResolvedValue(null);
});
afterEach(()=>vi.useRealTimers());
describe("Apple verified purchase transition",()=>{
  it("serializes creation and commits one receipt",async()=>{
    await expect(persistVerifiedApplePurchase(purchase)).resolves.toEqual({success:true});
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.appSubscriptionPayment.findUnique.mock.invocationCallOrder[0]);
    expect(db.appSubscriptionPayment.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({idempotenceKey:"apple:tx",amount:199,subscriptionId:"sub",status:"SUCCEEDED"}),
    }));
  });
  it("does not reassign an existing receipt to another user",async()=>{
    db.appSubscriptionPayment.findUnique.mockResolvedValue({id:"pay",userId:"other",appleOriginalTransactionId:"chain",status:"SUCCEEDED"});
    await expect(persistVerifiedApplePurchase(purchase)).resolves.toMatchObject({code:"APPLE_TRANSACTION_CONFLICT"});
    expect(db.appSubscription.create).not.toHaveBeenCalled();
    expect(db.appSubscriptionPayment.create).not.toHaveBeenCalled();
  });
  it("preserves the existing paid renewal policy for a fresh receipt but rejects reused free trial",async()=>{
    db.appSubscriptionPayment.findFirst.mockResolvedValue({id:"old-trial"});
    await expect(persistVerifiedApplePurchase({...purchase,priceMilliunits:0})).resolves.toMatchObject({code:"APPLE_TRIAL_ALREADY_USED"});
    await expect(persistVerifiedApplePurchase(purchase)).resolves.toEqual({success:true});
    expect(db.appSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{userId:"owner",provider:"APPLE",appleOriginalTransactionId:"chain"}}));
  });
  it("does not regress a newer paid period",async()=>{
    db.appSubscription.findFirst.mockResolvedValue({id:"sub",userId:"owner"});
    db.appSubscription.findUniqueOrThrow.mockResolvedValue(previous("ACTIVE",until,new Date("2027-01-01")));
    await expect(persistVerifiedApplePurchase(purchase)).resolves.toEqual({success:true});
    expect(db.appSubscription.update).not.toHaveBeenCalled();
    expect(db.appSubscriptionPayment.create).toHaveBeenCalledOnce();
  });
  it("updates a revoked paid receipt and refuses stale regrant",async()=>{
    db.appSubscription.findFirst.mockResolvedValue({id:"sub",userId:"owner"});
    db.appSubscription.findUniqueOrThrow.mockResolvedValue(previous());
    db.appSubscriptionPayment.findUnique.mockResolvedValue({id:"pay",userId:"owner",appleOriginalTransactionId:"chain",status:"SUCCEEDED"});
    await expect(persistVerifiedApplePurchase({...purchase,isRevoked:true})).resolves.toMatchObject({code:"APPLE_SUBSCRIPTION_INACTIVE"});
    expect(db.appSubscription.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"REVOKED"})}));
    expect(db.appSubscriptionPayment.updateMany).toHaveBeenCalledWith({where:{id:"pay",userId:"owner",status:"SUCCEEDED"},data:{status:"REFUNDED"}});
    db.appSubscription.findUniqueOrThrow.mockResolvedValue(previous("REVOKED"));
    db.appSubscriptionPayment.findUnique.mockResolvedValue({id:"pay",userId:"owner",appleOriginalTransactionId:"chain",status:"REFUNDED"});
    db.appSubscription.update.mockClear();
    await expect(persistVerifiedApplePurchase(purchase)).resolves.toMatchObject({code:"APPLE_SUBSCRIPTION_INACTIVE"});
    expect(db.appSubscription.update).not.toHaveBeenCalled();
  });
  it("server reconciliation rejects receipt ownership mismatch before updating entitlement",async()=>{
    db.appSubscription.findUniqueOrThrow.mockResolvedValue(previous());
    db.appSubscriptionPayment.findUnique.mockResolvedValue({id:"pay",userId:"other",appleOriginalTransactionId:"chain",status:"SUCCEEDED"});
    await expect(persistVerifiedAppleServerState({
      subscription:{id:"sub",userId:"owner"},originalTransactionId:"chain",transactionId:"tx",productId:"premium",
      status:"ACTIVE",planCode:"MONTHLY",paymentStatus:"SUCCEEDED",periodStart:from,periodEnd:until,
      priceMilliunits:199000,currency:"RUB",transaction:{},renewal:null,appleStatus:1,
    })).rejects.toThrow("APPLE_TRANSACTION_CONFLICT");
    expect(db.appSubscription.update).not.toHaveBeenCalled();
  });
  it("does not regrant a refunded transaction on reconciliation even with an ACTIVE row",async()=>{
    db.appSubscription.findUniqueOrThrow.mockResolvedValue(previous());
    db.appSubscriptionPayment.findUnique.mockResolvedValue({
      id:"pay",userId:"owner",subscriptionId:"sub",appleOriginalTransactionId:"chain",status:"REFUNDED",
    });
    await expect(persistVerifiedAppleServerState({
      subscription:{id:"sub",userId:"owner"},originalTransactionId:"chain",transactionId:"tx",productId:"premium",
      status:"ACTIVE",planCode:"MONTHLY",paymentStatus:"SUCCEEDED",periodStart:from,periodEnd:until,
      priceMilliunits:199000,currency:"RUB",transaction:{appAccountToken:"owner-token"},renewal:null,appleStatus:1,
    })).rejects.toThrow("APPLE_TRANSACTION_REVOKED");
    expect(db.appSubscription.update).not.toHaveBeenCalled();
    expect(db.appSubscriptionPayment.create).not.toHaveBeenCalled();
  });

});
