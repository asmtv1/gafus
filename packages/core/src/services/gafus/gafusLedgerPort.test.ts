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
  it("fails closed without SQL binding on reading or valid signed balance change",async()=>{
    const svc=await import("./walletService");
    await expect(svc.getGafusBalance("owner-A")).rejects.toThrow("GAFUS_LEDGER_PORT_UNBOUND");
    await expect(svc.listGafusTransactions({userId:"owner-A"})).rejects.toThrow("GAFUS_LEDGER_PORT_UNBOUND");
    await expect(svc.changeGafusBalanceTx({} as GafusTx,{
      userId:"owner-A",amount:1,idempotencyKey:"event-1",
    })).rejects.toThrow("GAFUS_LEDGER_PORT_UNBOUND");
  });
  it("preserves owner-scoped read and a single locked transaction token for CAS",async()=>{
    const core=await import("./gafusLedgerPort");const svc=await import("./walletService");
    const p=port();core.registerGafusLedgerRowsPort(p);
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
  it("rejects replacing the owner-scoped SQL repository during process lifetime",async()=>{
    const core=await import("./gafusLedgerPort");const p=port();core.registerGafusLedgerRowsPort(p);
    core.registerGafusLedgerRowsPort(p);
    expect(()=>core.registerGafusLedgerRowsPort(port())).toThrow("GAFUS_LEDGER_PORT_ALREADY_BOUND");
  });
});
