import { beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ apiClient: (...args: unknown[]) => request(...args) }));
import { subscriptionsApi } from "./subscriptions";

beforeEach(() => {
  request.mockReset().mockResolvedValue({ success: true });
});
describe("NOTIF050 existing push routes + owner guard", () => {
  it("POST push adds requestGuard for native actor-bound registration", async () => {
    const isCurrent = () => true;
    await subscriptionsApi.savePushSubscription(
      {
        endpoint: "synthetic-expo-token",
        keys: { p256dh: "expo", auth: "expo" },
      },
      isCurrent,
    );
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/v1/subscriptions/push", {
      method: "POST",
      body: { endpoint: "synthetic-expo-token", keys: { p256dh: "expo", auth: "expo" } },
      requestGuard: isCurrent,
    });
  });
  it("legacy isolated push registration keeps existing API payload", async () => {
    await subscriptionsApi.savePushSubscription({
      endpoint: "synthetic",
      keys: { p256dh: "expo", auth: "expo" },
    });
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/v1/subscriptions/push", {
      method: "POST",
      body: { endpoint: "synthetic", keys: { p256dh: "expo", auth: "expo" } },
    });
  });
  it("DELETE uses the existing route and owner requestGuard", async () => {
    const isCurrent = () => false;
    await subscriptionsApi.deletePushSubscription("synthetic", isCurrent);
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/v1/subscriptions/push", {
      method: "DELETE",
      body: { endpoint: "synthetic" },
      requestGuard: isCurrent,
    });
  });
  it("device-status readback uses guarded existing route", async () => {
    const isCurrent = () => true;
    await subscriptionsApi.postPushDeviceStatus(["synthetic"], isCurrent);
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/v1/subscriptions/push/device-status", {
      method: "POST",
      body: { endpoints: ["synthetic"] },
      requestGuard: isCurrent,
    });
  });
  it("existing current-device delete contract is owner-scoped server-side; no invented endpoint", async () => {
    await subscriptionsApi.deletePushSubscription("synthetic");
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/v1/subscriptions/push", {
      method: "DELETE",
      body: { endpoint: "synthetic" },
    });
  });
});
