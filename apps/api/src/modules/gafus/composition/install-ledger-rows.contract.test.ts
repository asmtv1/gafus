import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  balance:vi.fn(async (_owner:string)=>({balance:8})),
  history:vi.fn(async (_owner:string,_cursor:string|undefined,_limit:number)=>[]),
}));
vi.mock("@gafus/gafus-server/wallet-records",()=>({
  ensureWalletRow:vi.fn(),
  findLedgerEntry:vi.fn(),
  updateWalletBalanceRow:vi.fn(),
  appendLedgerEntry:vi.fn(),
  readWalletBalanceRow:sql.balance,
  readWalletLedgerRows:sql.history,
}));
describe("API Gafus ledger SQL read/write composition",()=>{
  it("never uses cross-owner history or a fabricated empty SQL response",async()=>{
    const core=await import("@gafus/core/services/gafus");
    await import("./install-ledger-rows");
    await expect(core.getGafusBalance("owner-B")).resolves.toBe(8);
    expect(sql.balance).toHaveBeenCalledExactlyOnceWith("owner-B");
    await expect(core.listGafusTransactions({userId:"owner-C",cursor:"previous",limit:2}))
      .resolves.toEqual({items:[],nextCursor:null});
    expect(sql.history).toHaveBeenCalledExactlyOnceWith("owner-C","previous",2);
    expect(()=>core.registerGafusLedgerRowsPort({} as never))
      .toThrow("GAFUS_LEDGER_PORT_ALREADY_BOUND");
  });
});
