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
    const c=await import("./locking");
    await expect(c.lockGafusUser({} as GafusTx,""))
      .rejects.toThrow("GAFUS_WALLET_OWNER_REQUIRED");
    await expect(c.withGafusUserLock("",async()=>0))
      .rejects.toThrow("GAFUS_WALLET_OWNER_REQUIRED");
  });
  it("fails closed without SQL lock for nonempty owner", async () => {
    const c=await import("./locking");
    await expect(c.lockGafusUser({} as GafusTx,"owner-A"))
      .rejects.toThrow("GAFUS_WALLET_LOCK_PORT_UNBOUND");
    await expect(c.withGafusUserLock("owner-A",async()=>0))
      .rejects.toThrow("GAFUS_WALLET_LOCK_PORT_UNBOUND");
  });
  it("forwards original DB transaction and owner, never opens another one in Core", async () => {
    const c=await import("./locking");const p=adapter();c.registerGafusLockPort(p);
    await c.lockGafusUser(p.tx,"owner-A");
    expect(p.lockGafusUser).toHaveBeenCalledExactlyOnceWith(p.tx,"owner-A");
    const op=vi.fn(async (tx:GafusTx)=>tx);
    await expect(c.withGafusUserLock("owner-A",op)).resolves.toBe(p.tx);
    expect(p.withGafusUserLock).toHaveBeenCalledWith("owner-A",op);
    expect(op).toHaveBeenCalledExactlyOnceWith(p.tx);
  });
  it("rejects replacing a process lock adapter", async () => {
    const c=await import("./locking");const p=adapter();
    c.registerGafusLockPort(p);c.registerGafusLockPort(p);
    expect(()=>c.registerGafusLockPort(adapter())).toThrow("GAFUS_WALLET_LOCK_PORT_ALREADY_BOUND");
  });
});
