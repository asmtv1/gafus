import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GafusTx } from "./types";
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
function port() {
  return {
    ensureWalletRow:vi.fn(async()=>({balance:0})),
    findLedgerEntry:vi.fn(async()=>null),
    updateWalletBalanceRow:vi.fn(async()=>({count:1})),
    appendLedgerEntry:vi.fn(async()=>({id:"ledger-1"})),
    readWalletBalanceRow:vi.fn(async()=>({balance:5})),
    readWalletLedgerRows:vi.fn(async()=>[]),
  };
}
describe("Gafus owner wallet SQL row port",()=>{
  it("requires an explicit SQL adapter",async()=>{
    const {createGafusWalletService}=await import("./walletService");
    expect(()=>createGafusWalletService(undefined as never)).toThrow("GAFUS_LEDGER_DEPENDENCIES_REQUIRED");
  });
  it("preserves owner-scoped read and a single locked transaction token for CAS",async()=>{
    const {createGafusWalletService}=await import("./walletService");
    const p=port();const svc=createGafusWalletService(p);
    const tx={walletLock:"same-transaction"} as unknown as GafusTx;
    await expect(svc.getGafusBalance("owner-B")).resolves.toBe(5);
    expect(p.readWalletBalanceRow).toHaveBeenCalledExactlyOnceWith("owner-B");
    const r=await svc.changeGafusBalanceTx(tx,{userId:"owner-B",amount:2,idempotencyKey:"idempotency-1"});
    expect(r).toEqual({transactionId:"ledger-1",balance:2,replay:false});
    expect(p.findLedgerEntry).toHaveBeenCalledExactlyOnceWith(tx,"idempotency-1");
    expect(p.ensureWalletRow).toHaveBeenCalledExactlyOnceWith(tx,"owner-B");
    expect(p.updateWalletBalanceRow).toHaveBeenCalledExactlyOnceWith(tx,"owner-B",2);
    expect(p.appendLedgerEntry).toHaveBeenCalledWith(tx,expect.objectContaining({
      userId:"owner-B",balanceBefore:0,balanceAfter:2,idempotencyKey:"idempotency-1",
    }));
  });
  it("reads history without shadowing the injected SQL port", async () => {
    const {createGafusWalletService}=await import("./walletService");
    const p=port();const svc=createGafusWalletService(p);
    await expect(svc.listGafusTransactions({userId:"owner-A",cursor:"cursor",limit:10}))
      .resolves.toEqual({items:[],nextCursor:null});
    expect(p.readWalletLedgerRows).toHaveBeenCalledExactlyOnceWith("owner-A","cursor",10);
  });
  it("isolates two independent owner-scoped repositories",async()=>{
    const {createGafusWalletService}=await import("./walletService");
    const a=port(),b=port();b.readWalletBalanceRow.mockResolvedValue({balance:9});
    const first=createGafusWalletService(a),second=createGafusWalletService(b);
    await expect(first.getGafusBalance("owner-A")).resolves.toBe(5);
    await expect(second.getGafusBalance("owner-A")).resolves.toBe(9);
    expect(a.readWalletBalanceRow).toHaveBeenCalledOnce();
    expect(b.readWalletBalanceRow).toHaveBeenCalledOnce();
  });
});
