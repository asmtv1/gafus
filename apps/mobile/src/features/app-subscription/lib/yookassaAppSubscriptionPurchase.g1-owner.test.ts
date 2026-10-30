import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ start: vi.fn(), open: vi.fn() }));
vi.mock("expo-web-browser", () => ({
  WebBrowserPresentationStyle: { FULL_SCREEN: "full" },
  openBrowserAsync: (...a: unknown[]) => m.open(...a),
}));
vi.mock("../api/appSubscriptionApi", () => ({
  appSubscriptionApi: { startYookassa: (...a: unknown[]) => m.start(...a) },
}));
import { yookassaAppSubscriptionPurchase } from "./yookassaAppSubscriptionPurchase";
beforeEach(() => {
  vi.clearAllMocks();
  m.start.mockResolvedValue({
    success: true,
    data: {
      confirmationUrl: "https://example.invalid/private",
      localSubscriptionId: "test-payment",
    },
  });
  m.open.mockResolvedValue({ type: "opened" });
});
describe("Android YooKassa owner and unknown guards", () => {
  it("does not send POST if owner is not verified", async () => {
    const result = await yookassaAppSubscriptionPurchase("MONTHLY", undefined, () => false);
    expect(result.ok).toBe(false);
    expect(m.start).not.toHaveBeenCalled();
    expect(m.open).not.toHaveBeenCalled();
  });
  it("does not launch payment URL for B when A switched while POST pending", async () => {
    let own = true;
    m.start.mockImplementationOnce(async () => {
      own = false;
      return {
        success: true,
        data: { confirmationUrl: "https://example.invalid/private", localSubscriptionId: "one" },
      };
    });
    const result = await yookassaAppSubscriptionPurchase("MONTHLY", undefined, () => own);
    expect(result).toMatchObject({ ok: false, uncertain: true });
    expect(m.open).not.toHaveBeenCalled();
  });
  it("unknown browser outcome is not paid success", async () => {
    m.open.mockRejectedValueOnce(new Error("private-signed-payment-url"));
    const result = await yookassaAppSubscriptionPurchase("MONTHLY", undefined, () => true);
    expect(result).toMatchObject({ ok: false, uncertain: true });
  });
  it("timeout after a start attempt remains uncertain and never opens browser", async () => {
    m.start.mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT", error: "timeout" });
    const result = await yookassaAppSubscriptionPurchase("MONTHLY", undefined, () => true);
    expect(result).toMatchObject({ ok: false, uncertain: true });
    expect(m.open).not.toHaveBeenCalled();
  });
  it("malformed successful envelope remains uncertain", async () => {
    m.start.mockResolvedValueOnce({ success: true, data: { localSubscriptionId: "one" } });
    const result = await yookassaAppSubscriptionPurchase("MONTHLY", undefined, () => true);
    expect(result).toMatchObject({ ok: false, uncertain: true });
    expect(m.open).not.toHaveBeenCalled();
  });
  it("offers only browser launch, never asserts server entitlement", async () => {
    const result = await yookassaAppSubscriptionPurchase("MONTHLY", undefined, () => true);
    expect(result).toEqual({ ok: true, localSubscriptionId: "test-payment" });
    expect(m.open).toHaveBeenCalledTimes(1);
  });
});
