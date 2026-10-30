import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  init: vi.fn(),
  fetch: vi.fn(),
  request: vi.fn(),
  finish: vi.fn(),
  verify: vi.fn(),
  log: vi.fn(),
}));
vi.mock("expo-iap", () => ({
  ErrorCode: { UserCancelled: "USER_CANCELLED" },
  initConnection: (...args: unknown[]) => m.init(...args),
  fetchProducts: (...args: unknown[]) => m.fetch(...args),
  requestPurchase: (...args: unknown[]) => m.request(...args),
  finishTransaction: (...args: unknown[]) => m.finish(...args),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.log(...a) }));
vi.mock("../api/appSubscriptionApi", () => ({
  appSubscriptionApi: { verifyAppleSubscription: (...a: unknown[]) => m.verify(...a) },
}));
import { runAppleAppSubscriptionPurchase } from "./appleAppSubscriptionPurchase";
const TOKEN = "b713906f-c774-41d9-84ae-1585fb13f232";
const OWNER = () => true;
beforeEach(() => {
  vi.clearAllMocks();
  m.init.mockResolvedValue(undefined);
  m.fetch.mockResolvedValue([{ id: "apple-monthly" }]);
  m.request.mockResolvedValue({ purchaseToken: "signed-jws" });
  m.verify.mockResolvedValue({ success: true, data: { success: true } });
  m.finish.mockResolvedValue(undefined);
});
describe("Apple subscription stable-token and owner boundary", () => {
  it.each([undefined, null, "", "not-uuid", "f3847e9a-f121-41c6-81df-000000000000 extra"])(
    "refuses absent or invalid persisted token before opening StoreKit: %s",
    async (token) => {
      const result = await runAppleAppSubscriptionPurchase("apple-monthly", {
        appAccountToken: token,
      });
      expect(result.ok).toBe(false);
      expect(m.init).not.toHaveBeenCalled();
      expect(m.fetch).not.toHaveBeenCalled();
      expect(m.request).not.toHaveBeenCalled();
      expect(m.verify).not.toHaveBeenCalled();
    },
  );
  it("does not start a purchase after account switched during product lookup", async () => {
    let current = true;
    m.fetch.mockImplementationOnce(async () => {
      current = false;
      return [{ id: "apple-monthly" }];
    });
    const result = await runAppleAppSubscriptionPurchase("apple-monthly", {
      appAccountToken: TOKEN,
      isCurrentAccount: () => current,
    });
    expect(result.ok).toBe(false);
    expect(m.request).not.toHaveBeenCalled();
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("does not verify a purchase against a different signed-in account after purchase returns", async () => {
    let current = true;
    m.request.mockImplementationOnce(async () => {
      current = false;
      return { purchaseToken: "signed-jws" };
    });
    const result = await runAppleAppSubscriptionPurchase("apple-monthly", {
      appAccountToken: TOKEN,
      isCurrentAccount: () => current,
    });
    expect(result).toMatchObject({ ok: false, uncertain: true });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("keeps verification timeout as unknown rather than a false failed purchase", async () => {
    m.verify.mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT", error: "timeout" });
    const result = await runAppleAppSubscriptionPurchase("apple-monthly", {
      appAccountToken: TOKEN,
      isCurrentAccount: OWNER,
    });
    expect(result).toMatchObject({ ok: false, uncertain: true });
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("returns verified success only while same account and after server confirmation", async () => {
    const result = await runAppleAppSubscriptionPurchase("apple-monthly", {
      appAccountToken: TOKEN,
      isCurrentAccount: OWNER,
    });
    expect(result).toEqual({ ok: true });
    expect(m.request).toHaveBeenCalledWith({
      request: { apple: { sku: "apple-monthly", appAccountToken: TOKEN } },
      type: "subs",
    });
    expect(m.verify).toHaveBeenCalledTimes(1);
    expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it("does not log signed transactions or provider error text", async () => {
    m.request.mockRejectedValueOnce(Error("private-token-in-apple-error"));
    await runAppleAppSubscriptionPurchase("apple-monthly", {
      appAccountToken: TOKEN,
      isCurrentAccount: OWNER,
    });
    const trace = JSON.stringify(m.log.mock.calls);
    expect(trace).not.toContain("private-token-in-apple-error");
    expect(trace).not.toContain(TOKEN);
    expect(trace).not.toContain("signed-jws");
  });
});
