import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GafusTx } from "./types";
const fake=vi.hoisted(()=>({config:vi.fn(async()=>({
  economyEnabled:true,spendingEnabled:true,courseStepCost:1,miniGuideCost:1,
  accessDurationSeconds:604800,revision:1,
}))}));
vi.mock("./settingsService",()=>({getGafusSettingsTx:fake.config}));
vi.mock("../contentAccess",()=>({
  resolveArticleTargetTx:vi.fn(async(_tx:unknown,id:string)=>({
    type:"ARTICLE",articleId:id,targetKey:`article:${id}`,
  })),
  resolveArticleAccessTx:vi.fn(async()=>({allowed:false,eligibleForGafus:true,expiresAt:null,source:"DENIED"})),
}));
vi.mock("./walletService",()=>({
  ensureGafusWalletTx:vi.fn(async()=>({balance:5})),
  changeGafusBalanceTx:vi.fn(async()=>({transactionId:"debit-1",balance:4,replay:false})),
}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
function port() {
  const tx={dbConnection:"same-advisory-locked-tx"} as unknown as GafusTx;
  return {tx,
    withGafusUnlockTransaction:vi.fn(async <T>(_owner:string,fn:(tx:GafusTx)=>Promise<T>)=>fn(tx)),
    readGafusUnlockReplayTx:vi.fn(async()=>null),
    insertGafusUnlockGrantTx:vi.fn(async()=>({id:"grant-1"})),
  };
}
describe("atomic Gafus unlock PostgreSQL transaction port",()=>{
  it("fails closed without server-owned advisory transaction",async()=>{
    const c=await import("./accessGrantService");
    await expect(c.unlockArticleWithGafus({
      userId:"owner-1",articleId:"article-1",clientRequestId:"request-001",
    })).rejects.toThrow("GAFUS_UNLOCK_PORT_UNBOUND");
  });
  it("uses one same advisory-locked transaction from replay to debit to owner grant",async()=>{
    const c=await import("./accessGrantService");const p=await import("./gafusUnlockPort");
    const rows=port();p.registerGafusUnlockRowsPort(rows);
    const res=await c.unlockArticleWithGafus({
      userId:"owner-1",articleId:"article-1",clientRequestId:"request-001",
      now:new Date("2026-11-12T08:00:00.000Z"),
    });
    expect(res).toMatchObject({spent:1,balance:4,accessSource:"GAFUS",replay:false});
    expect(rows.withGafusUnlockTransaction).toHaveBeenCalledWith("owner-1",expect.any(Function));
    expect(rows.readGafusUnlockReplayTx).toHaveBeenCalledWith(rows.tx,"gafus:unlock:owner-1:request-001");
    expect(rows.insertGafusUnlockGrantTx).toHaveBeenCalledWith(rows.tx,expect.objectContaining({
      userId:"owner-1",targetType:"ARTICLE",targetKey:"article:article-1",transactionId:"debit-1",
      grantedAt:new Date("2026-11-12T08:00:00.000Z"),
    }));
    expect(rows.readGafusUnlockReplayTx.mock.invocationCallOrder[0]).toBeLessThan(
      rows.insertGafusUnlockGrantTx.mock.invocationCallOrder[0],
    );
  });
  it("cannot replace an active PostgreSQL transaction port",async()=>{
    const p=await import("./gafusUnlockPort");const rows=port();p.registerGafusUnlockRowsPort(rows);
    p.registerGafusUnlockRowsPort(rows);
    expect(()=>p.registerGafusUnlockRowsPort(port())).toThrow("GAFUS_UNLOCK_PORT_ALREADY_BOUND");
  });
});
