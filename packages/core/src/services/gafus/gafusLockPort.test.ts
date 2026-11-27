import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GafusTx } from "./types";
beforeEach(() => vi.resetModules());
function adapter() {
  const tx={__transaction:"one-server-connection"} as unknown as GafusTx;
  return {tx,
    lockGafusUser:vi.fn(async (_tx:GafusTx,_userId:string)=>{}),
    withGafusUserLock:vi.fn(async <T>(_userId:string,action:(tx:GafusTx)=>Promise<T>)=>action(tx)),
  };
}
describe("Gafus wallet lock is a single transactional Persistence port", () => {
  it("preserves existing owner-required public error", async () => {
    const {createGafusLockService}=await import("./locking");
    const c=createGafusLockService(adapter());
    await expect(c.lockGafusUser({} as GafusTx,""))
      .rejects.toThrow("GAFUS_WALLET_OWNER_REQUIRED");
    await expect(c.withGafusUserLock("",async()=>0))
      .rejects.toThrow("GAFUS_WALLET_OWNER_REQUIRED");
  });
  it("requires an explicit lock adapter", async () => {
    const {createGafusLockService}=await import("./locking");
    expect(()=>createGafusLockService(undefined as never)).toThrow("GAFUS_WALLET_LOCK_DEPENDENCIES_REQUIRED");
  });
  it("forwards original DB transaction and owner, never opens another one in Core", async () => {
    const {createGafusLockService}=await import("./locking");const p=adapter();const c=createGafusLockService(p);
    await c.lockGafusUser(p.tx,"owner-A");
    expect(p.lockGafusUser).toHaveBeenCalledExactlyOnceWith(p.tx,"owner-A");
    const op=vi.fn(async (tx:GafusTx)=>tx);
    await expect(c.withGafusUserLock("owner-A",op)).resolves.toBe(p.tx);
    expect(p.withGafusUserLock).toHaveBeenCalledWith("owner-A",op);
    expect(op).toHaveBeenCalledExactlyOnceWith(p.tx);
  });
  it("keeps transactions isolated across independent instances",async()=>{
    const {createGafusLockService}=await import("./locking");
    const a=adapter(),b=adapter();
    await createGafusLockService(a).lockGafusUser(a.tx,"owner-A");
    await createGafusLockService(b).lockGafusUser(b.tx,"owner-B");
    expect(a.lockGafusUser).toHaveBeenCalledExactlyOnceWith(a.tx,"owner-A");
    expect(b.lockGafusUser).toHaveBeenCalledExactlyOnceWith(b.tx,"owner-B");
  });
});
