import { describe, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({
  lock:vi.fn(async (_tx:unknown,_owner:string)=>{}),
  withLock:vi.fn(async (_owner:string,fn:(tx:unknown)=>Promise<unknown>)=>fn({db:"locked"})),
}));
vi.mock("@gafus/gafus-server/wallet-lock",()=>({
  lockGafusUser:db.lock,withGafusUserLock:db.withLock,
}));
describe("API Gafus wallet advisory-lock composition",()=>{
  it("preserves same transaction and owner across Core and SQL lock",async()=>{
    const {gafusLock:core}=await import("./wallet-lock-instance");
    const tx={db:"tx-1"};
    await core.lockGafusUser(tx as never,"owner-1");
    expect(db.lock).toHaveBeenCalledExactlyOnceWith(tx,"owner-1");
    await expect(core.withGafusUserLock("owner-1",async value=>value)).resolves.toEqual({db:"locked"});
    expect(db.withLock).toHaveBeenCalledWith("owner-1",expect.any(Function));
  });
});
