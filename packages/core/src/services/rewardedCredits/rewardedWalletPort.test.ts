import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RewardedWalletTx, RewardedWalletPort } from "./rewardedWalletPort";
const premiums=vi.hoisted(()=>({ access:vi.fn(async()=>({hasActiveSubscription:false})) }));
vi.mock("../appSubscription",()=>({getAppSubscriptionAccess:premiums.access}));
const settings = vi.fn();
const tx={lockedOwner:"rewarded:owner-1"} as unknown as RewardedWalletTx;
function stub():RewardedWalletPort {
 const db={
  withLockedRewardedWallet:vi.fn(async <T>(_user:string,fn:(tx:RewardedWalletTx)=>Promise<T>)=>fn(tx)),
  ensureRewardedWalletRow:vi.fn(async()=>({balance:2,pendingRefundCredits:3})),
  updateRewardedWalletRow:vi.fn(async()=>({balance:5,pendingRefundCredits:0})),
  countTodayRewardedAds:vi.fn(async()=>0),
  hasRewardedTargetSpendRow:vi.fn(async()=>false),
  findRewardedTransactionByKey:vi.fn(async()=>null),
  appendRewardedWalletEntry:vi.fn(async()=>({id:"ledger-1"})),
 };
 return db;
}
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();premiums.access.mockResolvedValue({hasActiveSubscription:false});});
describe("rewarded credits wallet atomic SQL port",()=>{
  it("requires explicit wallet dependencies",async()=>{
    const {createRewardedWalletService}=await import("./walletService");
    expect(()=>createRewardedWalletService(undefined as never,settings,premiums.access)).toThrow("REWARDED_WALLET_DEPENDENCIES_REQUIRED");
  });
  it("settles pending refunds in the SAME advisory-locked owner transaction",async()=>{
    const {createRewardedWalletService}=await import("./walletService");
    const db=stub();const service=createRewardedWalletService(db,settings,premiums.access);
    await expect(service.getRewardedCreditBalance("owner-1")).resolves.toBe(5);
    expect(db.withLockedRewardedWallet).toHaveBeenCalledWith("owner-1",expect.any(Function));
    expect(db.ensureRewardedWalletRow).toHaveBeenCalledExactlyOnceWith("owner-1",tx);
    expect(db.updateRewardedWalletRow).toHaveBeenCalledExactlyOnceWith(tx,"owner-1",{balance:5,pendingRefundCredits:0});
  });
  it("replays one already-processed spend without inserting a second debit",async()=>{
    const {createRewardedWalletService}=await import("./walletService");
    const db=stub();db.findRewardedTransactionByKey=vi.fn(async()=>({id:"old-spend"}));
    db.ensureRewardedWalletRow=vi.fn(async()=>({balance:5,pendingRefundCredits:0}));
    const service=createRewardedWalletService(db,settings,premiums.access);
    await expect(service.spendRewardedCredits({
      userId:"owner-1",target:{targetType:"ARTICLE",targetId:"article-1"},
      amount:1,idempotencyKey:"key:already-spent",
    })).resolves.toMatchObject({transactionId:"old-spend",spentCredits:0,replay:true});
    expect(db.findRewardedTransactionByKey).toHaveBeenCalledExactlyOnceWith(tx,"key:already-spent");
    expect(db.appendRewardedWalletEntry).not.toHaveBeenCalled();
    expect(db.updateRewardedWalletRow).not.toHaveBeenCalled();
  });
  it("isolates two wallet instances",async()=>{
    const {createRewardedWalletService}=await import("./walletService");
    const a=stub(), b=stub();
    b.ensureRewardedWalletRow=vi.fn(async()=>({balance:9,pendingRefundCredits:0}));
    const first=createRewardedWalletService(a,settings,premiums.access);
    const second=createRewardedWalletService(b,settings,premiums.access);
    expect(await first.getRewardedCreditBalance("owner-1")).toBe(5);
    expect(await second.getRewardedCreditBalance("owner-2")).toBe(9);
    expect(b.ensureRewardedWalletRow).toHaveBeenCalledExactlyOnceWith("owner-2",tx);
  });
});
