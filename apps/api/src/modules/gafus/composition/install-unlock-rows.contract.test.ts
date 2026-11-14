import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  transact:vi.fn(async(_owner:string,action:(tx:unknown)=>Promise<unknown>)=>action({locked:"same-pg-tx"})),
  replay:vi.fn(async(_tx:unknown,_key:string)=>null),
  grant:vi.fn(async(_tx:unknown,_grant:unknown)=>({id:"grant"})),
}));
vi.mock("@gafus/gafus-server/unlock-records",()=>({
  withGafusUnlockTransaction:sql.transact,
  readGafusUnlockReplayTx:sql.replay,
  insertGafusUnlockGrantTx:sql.grant,
}));
describe("API content-unlock atomic rows composition",()=>{
  it("binds canonical SQL transaction once; same Tx reaches replay and grant",async()=>{
    const core=await import("@gafus/core/services/gafus");
    await import("./install-unlock-rows");
    // The adapter is reachable through the Core port, but the original
    // domain policy still owns all public validation and target checks.
    const p=core;
    const result=await p.requireGafusUnlockRowsPort().withGafusUnlockTransaction("owner",async tx=>{
      await p.requireGafusUnlockRowsPort().readGafusUnlockReplayTx(tx,"key");
      return p.requireGafusUnlockRowsPort().insertGafusUnlockGrantTx(tx,{} as never);
    });
    expect(result).toEqual({id:"grant"});
    expect(sql.transact).toHaveBeenCalledTimes(1);
    expect(sql.replay.mock.calls[0]?.[0]).toBe(sql.grant.mock.calls[0]?.[0]);
    expect(()=>core.registerGafusUnlockRowsPort({} as never))
      .toThrow("GAFUS_UNLOCK_PORT_ALREADY_BOUND");
  });
});
