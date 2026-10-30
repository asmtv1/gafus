import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppleTokenInitializationAdapter } from "./appleTokenInitializationAdapter";

const UUID_A = "b713906f-c774-41d9-84ae-1585fb13f232";
const UUID_B = "838befa4-f95c-485d-a4a5-6cde79915d73";
const EPOCH_A = "51e35071-0752-4f22-b3aa-23f8844c8931";
const EPOCH_B = "67b6036b-c6c2-43d7-8e78-fd3b3d806ba2";
const snapshot = (token: string | null) => ({
  success: true as const,
  data: { appleAppAccountToken: token },
});
const initialized = (token: string) => ({
  success: true as const,
  data: { appleAppAccountToken: token },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let actor: { ownerId: string; authEpoch: string } | null;
const read = vi.fn();
const init = vi.fn();
const storeKit = vi.fn();
const create = (allowInit = true) =>
  createAppleTokenInitializationAdapter({
    currentActor: () => actor,
    fetchSnapshot: () => read(),
    ...(allowInit ? { initializeToken: () => init() } : {}),
    purchase: (args) => storeKit(args),
  });
beforeEach(() => {
  vi.clearAllMocks();
  actor = { ownerId: "A", authEpoch: EPOCH_A };
  read.mockResolvedValue(snapshot(UUID_A));
  init.mockResolvedValue(initialized(UUID_A));
  storeKit.mockResolvedValue({ ok: true });
});
describe("AG1 token Phase A unmounted review / Mobile injected adapter", () => {
  it("old iOS-client token in snapshot falls back to original purchase without init", async () => {
    const result = await create(false).begin("apple-monthly");
    expect(result).toMatchObject({ ok: true, source: "existing_token" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(init).not.toHaveBeenCalled();
    expect(storeKit).toHaveBeenCalledTimes(1);
    expect(storeKit.mock.calls[0]?.[0].appAccountToken).toBe(UUID_A);
  });
  it("null token requires explicit injected init and exact read-only snapshot readback", async () => {
    read.mockReset().mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(snapshot(UUID_A));
    const result = await create(true).begin("apple-monthly");
    expect(result).toMatchObject({ ok: true, source: "explicit_init" });
    expect(read).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenCalledTimes(1);
    expect(storeKit.mock.calls[0]?.[0].appAccountToken).toBe(UUID_A);
  });
  it("null token without approved injection fails closed without StoreKit", async () => {
    read.mockResolvedValueOnce(snapshot(null));
    expect(await create(false).begin("apple-monthly")).toEqual({
      ok: false,
      reason: "INITIALIZATION_NOT_APPROVED",
    });
    expect(init).not.toHaveBeenCalled();
    expect(storeKit).not.toHaveBeenCalled();
  });
  it("rapid doubletap while init pending issues one init and one purchase", async () => {
    read.mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(snapshot(UUID_A));
    const d = deferred<ReturnType<typeof initialized>>();
    init.mockReturnValueOnce(d.promise);
    const adapter = create(true);
    const first = adapter.begin("apple-monthly");
    await Promise.resolve();
    expect(await adapter.begin("apple-monthly")).toEqual({
      ok: false,
      reason: "ALREADY_IN_PROGRESS",
    });
    d.resolve(initialized(UUID_A));
    expect(await first).toMatchObject({ ok: true });
    expect(init).toHaveBeenCalledTimes(1);
    expect(storeKit).toHaveBeenCalledTimes(1);
  });
  it("explicit auth init 401 / 403 / 429 / 500 or thrown network leaves purchase blocked", async () => {
    for (const code of ["SESSION_EXPIRED", "CSRF_DENIED", "RATE_LIMITED", "INTERNAL_ERROR"]) {
      read.mockReset().mockResolvedValue(snapshot(null));
      init.mockReset().mockResolvedValueOnce({ success: false, code });
      expect(await create(true).begin("apple-monthly")).toEqual({
        ok: false,
        reason: "INITIALIZATION_FAILED",
      });
    }
    init.mockRejectedValueOnce(Error("private-token-never-log"));
    expect(await create(true).begin("apple-monthly")).toEqual({
      ok: false,
      reason: "INITIALIZATION_FAILED",
    });
    expect(storeKit).not.toHaveBeenCalled();
  });
  it("rejects token malformed by injected init, without client generating a new UUID", async () => {
    read.mockResolvedValueOnce(snapshot(null));
    init.mockResolvedValueOnce(initialized("not-a-uuid"));
    expect(await create(true).begin("apple-monthly")).toEqual({
      ok: false,
      reason: "TOKEN_INVALID",
    });
    expect(storeKit).not.toHaveBeenCalled();
  });
  it("readback missing, changed or malformed never reaches StoreKit", async () => {
    for (const late of [
      snapshot(null),
      snapshot(UUID_B),
      { success: false as const, code: "REQUEST_TIMEOUT" },
    ]) {
      read.mockReset().mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(late);
      expect(await create(true).begin("apple-monthly")).toEqual({
        ok: false,
        reason: "READBACK_UNVERIFIED",
      });
    }
    expect(storeKit).not.toHaveBeenCalled();
  });
  it("A->B swap during init ignores late token and cannot purchase as B", async () => {
    read.mockResolvedValueOnce(snapshot(null));
    init.mockImplementationOnce(async () => {
      actor = { ownerId: "B", authEpoch: EPOCH_A };
      return initialized(UUID_A);
    });
    expect(await create(true).begin("apple-monthly")).toEqual({
      ok: false,
      reason: "SESSION_CHANGED",
    });
    expect(storeKit).not.toHaveBeenCalled();
  });
  it("A/E1->A/E2 before snapshot readback ignores late response", async () => {
    read
      .mockReset()
      .mockResolvedValueOnce(snapshot(null))
      .mockImplementationOnce(async () => {
        actor = { ownerId: "A", authEpoch: EPOCH_B };
        return snapshot(UUID_A);
      });
    expect(await create(true).begin("apple-monthly")).toEqual({
      ok: false,
      reason: "SESSION_CHANGED",
    });
    expect(storeKit).not.toHaveBeenCalled();
  });
  it("late StoreKit promise after owner switch cannot become paid success", async () => {
    const d = deferred<{ ok: boolean }>();
    storeKit.mockReturnValueOnce(d.promise);
    const first = create(true).begin("apple-monthly");
    await Promise.resolve();
    actor = { ownerId: "B", authEpoch: EPOCH_B };
    d.resolve({ ok: true });
    expect(await first).toEqual({ ok: false, reason: "SESSION_CHANGED" });
    expect(init).not.toHaveBeenCalled();
  });
  it("StoreKit exception becomes unknown, not failure proof or replay", async () => {
    storeKit.mockRejectedValueOnce(Error("receipt-data-unsafe-to-log"));
    expect(await create(true).begin("apple-monthly")).toEqual({
      ok: false,
      reason: "PURCHASE_UNKNOWN",
    });
    expect(storeKit).toHaveBeenCalledTimes(1);
  });
  it("missing product or unverified session never reads init or StoreKit", async () => {
    expect(await create(true).begin("")).toEqual({ ok: false, reason: "TOKEN_INVALID" });
    actor = null;
    expect(await create(true).begin("apple-monthly")).toEqual({
      ok: false,
      reason: "SESSION_CHANGED",
    });
    expect(init).not.toHaveBeenCalled();
    expect(storeKit).not.toHaveBeenCalled();
  });
});
