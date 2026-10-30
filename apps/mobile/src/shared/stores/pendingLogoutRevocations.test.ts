import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { store.delete(key); }),
}));

import {
  rememberPendingLogout,
  acknowledgePendingLogout,
  retryPendingLogouts,
} from "./pendingLogoutRevocations";

beforeEach(() => { store.clear(); vi.clearAllMocks(); });

describe("encrypted offline logout revocation queue", () => {
  it("retains different offline accounts without overwriting or duplicating", async () => {
    await Promise.all([rememberPendingLogout("A"), rememberPendingLogout("B"), rememberPendingLogout("A")]);
    const pending = [...store.values()];
    expect(pending.sort()).toEqual(["A", "B"]);
    expect(store.size).toBe(2);
  });

  it("retries all pending accounts, keeping only failed revocations", async () => {
    await rememberPendingLogout("A");
    await rememberPendingLogout("B");
    const revoke = vi.fn(async (value: string) => ({ success: value === "B" }));
    const failures = vi.fn();
    await retryPendingLogouts(revoke, failures);
    expect(revoke).toHaveBeenCalledWith("A");
    expect(revoke).toHaveBeenCalledWith("B");
    expect([...store.values()]).toEqual(["A"]);
    revoke.mockResolvedValue({ success: true });
    await retryPendingLogouts(revoke, failures);
    expect(store.size).toBe(0);
    expect(failures).not.toHaveBeenCalled();
  });

  it("retains unconfirmed revocations after thrown network errors", async () => {
    await rememberPendingLogout("X");
    const failures = vi.fn();
    await retryPendingLogouts(async () => { throw new Error("disconnected"); }, failures);
    expect([...store.values()]).toEqual(["X"]);
    expect(failures).toHaveBeenCalledOnce();
  });

  it("does not lose newly queued credentials during an in-flight retry", async () => {
    await rememberPendingLogout("first");
    let finish!: (value: { success: boolean }) => void;
    const revoke = vi.fn(() => new Promise<{ success: boolean }>((resolve) => { finish = resolve; }));
    const flight = retryPendingLogouts(revoke, vi.fn());
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
    await rememberPendingLogout("second");
    finish({ success: true });
    await flight;
    expect([...store.values()]).toEqual(["second"]);
  });

  it("never overwrites earlier revocations when the protected queue is full", async () => {
    for (let i = 0; i < 24; i++) await rememberPendingLogout(`session-${i}`);
    const previous = [...store.values()].sort();
    await expect(rememberPendingLogout("overflow")).rejects.toThrow("capacity");
    expect([...store.values()].sort()).toEqual(previous);
    expect(store.size).toBe(24);
  });

  it("retains queued credentials across module reinitialization", async () => {
    await rememberPendingLogout("pre-restart");
    vi.resetModules();
    const fresh = await import("./pendingLogoutRevocations");
    const revoke = vi.fn(async () => ({ success: true }));
    await fresh.retryPendingLogouts(revoke, vi.fn());
    expect(revoke).toHaveBeenCalledWith("pre-restart");
    expect(store.size).toBe(0);
  });

  it("migrates a previously saved single-slot revocation", async () => {
    store.set("auth_pending_logout_token", "legacy-session");
    const revoke = vi.fn(async () => ({ success: false }));
    await retryPendingLogouts(revoke, vi.fn());
    expect(revoke).toHaveBeenCalledWith("legacy-session");
    expect(store.get("auth_pending_logout_token")).toBeUndefined();
    expect([...store.values()]).toEqual(["legacy-session"]);
    await acknowledgePendingLogout("legacy-session");
    expect(store.size).toBe(0);
  });
});
