import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  tx:{sameSqlConnection:"pg-advisory-rewarded-owner"},
  withOwner:vi.fn(async <T>(_user:string,fn:(tx:unknown)=>Promise<T>)=>fn({sameSqlConnection:"pg-advisory-rewarded-owner"})),
  ensure:vi.fn(async()=>({balance:3,pendingRefundCredits:0})),
  update:vi.fn(async()=>({balance:3,pendingRefundCredits:0})),
}));
vi.mock("@gafus/gafus-server/rewarded-wallet-rows",()=>({
  withLockedRewardedWallet:sql.withOwner,
  ensureRewardedWalletRow:sql.ensure,
  updateRewardedWalletRow:sql.update,
  countTodayRewardedAds:vi.fn(async()=>0),
  hasRewardedTargetSpendRow:vi.fn(async()=>false),
  findRewardedTransactionByKey:vi.fn(async()=>null),
  appendRewardedWalletEntry:vi.fn(async()=>({id:"ledger-1"})),
}));
describe("API legacy rewarded wallet SQL composition",()=>{
  it("passes the SAME PG owner transaction to balance projection through the explicit instance",async()=>{
    const core=await import("@gafus/core/services/rewardedCredits");
    const {rewardedWalletRows}=await import("./wallet-rows-instance");
    const service=core.createRewardedWalletService(rewardedWalletRows,vi.fn(),vi.fn());
    await expect(service.getRewardedCreditBalance("owner-1")).resolves.toBe(3);
    expect(sql.withOwner).toHaveBeenCalledExactlyOnceWith("owner-1",expect.any(Function));
    expect(sql.ensure).toHaveBeenCalledExactlyOnceWith("owner-1",{sameSqlConnection:"pg-advisory-rewarded-owner"});
    expect(sql.update).not.toHaveBeenCalled();

  });
});
