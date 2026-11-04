import { describe, expect, it, vi } from "vitest";
import { chat2SubscriptionForConnection, chat2SubscriptionTransportOptions } from "./realtimeSubscription";
const connection = { token: "synthetic-connection", wsUrl: "wss://gafus.ru/connection/websocket" };
describe("shared Chat2 Web/Mobile cutover handshake", () => {
  it("never requests or submits any room JWT in server-advertised proxy-only mode", async () => {
    const legacy = vi.fn();
    expect(await chat2SubscriptionForConnection({ ...connection, subscriptionMode: "proxy" },
      "room_1", legacy)).toEqual({ mode: "proxy", channel: "chat2:room_1" });
    expect(legacy).not.toHaveBeenCalled();
  });
  it("keeps absent mode backward compatible with the existing signed room endpoint", async () => {
    const legacy = vi.fn().mockResolvedValue({ channel: "chat2:room_1", token: "signed-room" });
    expect(await chat2SubscriptionForConnection(connection, "room_1", legacy))
      .toEqual({ mode: "token", channel: "chat2:room_1", token: "signed-room" });
    expect(legacy).toHaveBeenCalledOnce();
  });
  it("keeps explicitly marked token mode compatible", async () => {
    expect((await chat2SubscriptionForConnection({ ...connection, subscriptionMode: "token" },
      "room_1", async () => ({ channel: "chat2:room_1", token: "signed" }))).mode)
      .toBe("token");
  });
  it("rejects replay/room mismatch from a legacy endpoint", async () => {
    await expect(chat2SubscriptionForConnection(connection, "room_1",
      async () => ({ channel: "chat2:other", token: "signed" })))
      .rejects.toThrow("CHAT2_LEGACY_GRANT_MISMATCH");
  });
  it("rejects invalid room keys before contacting server", async () => {
    const legacy = vi.fn();
    await expect(chat2SubscriptionForConnection(connection, "../room", legacy))
      .rejects.toThrow("CHAT2_ROOM_ID_INVALID");
    expect(legacy).not.toHaveBeenCalled();
  });
  it("proxy transport for both consumers never supplies a room token or token refresh on reconnect", async () => {
    const fetchLegacy = vi.fn();
    const refreshLegacy = vi.fn().mockResolvedValue("do-not-use");
    const newSubscription = vi.fn();
    for (const consumer of ["web", "mobile"]) {
      const grant = await chat2SubscriptionForConnection(
        { ...connection, subscriptionMode: "proxy" }, "room_1", fetchLegacy);
      const options = chat2SubscriptionTransportOptions(grant, refreshLegacy);
      newSubscription(grant.channel, options);
      expect(options).toEqual({});
      expect(Object.hasOwn(options, "token")).toBe(false);
      expect(Object.hasOwn(options, "getToken")).toBe(false);
      expect(consumer).toMatch(/web|mobile/);
    }
    expect(newSubscription).toHaveBeenCalledTimes(2);
    expect(newSubscription).toHaveBeenNthCalledWith(1, "chat2:room_1", {});
    expect(newSubscription).toHaveBeenNthCalledWith(2, "chat2:room_1", {});
    expect(fetchLegacy).not.toHaveBeenCalled();
    expect(refreshLegacy).not.toHaveBeenCalled();
  });
  it("missing/explicit token mode keeps initial JWT and on-demand refresh for Web and Mobile", async () => {
    const legacy = vi.fn().mockResolvedValue({ channel: "chat2:room_1", token: "signed" });
    const refresh = vi.fn().mockResolvedValue("refreshed");
    const newSubscription = vi.fn();
    for (const mode of [undefined, "token"] as const) {
      const grant = await chat2SubscriptionForConnection(
        { ...connection, subscriptionMode: mode }, "room_1", legacy);
      const options = chat2SubscriptionTransportOptions(grant, refresh);
      newSubscription(grant.channel, options);
      expect(options).toMatchObject({ token: "signed" });
      expect("getToken" in options && await options.getToken()).toBe("refreshed");
    }
    expect(newSubscription).toHaveBeenCalledTimes(2);
    expect(legacy).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it("unexpected server cutover mode fails closed instead of fetching a legacy room JWT", async () => {
    const legacy = vi.fn();
    await expect(chat2SubscriptionForConnection(
      { ...connection, subscriptionMode: "future" as "token" }, "room_1", legacy))
      .rejects.toThrow("CHAT2_SUBSCRIPTION_MODE_INVALID");
    await expect(chat2SubscriptionForConnection(
      { ...connection, subscriptionMode: null as unknown as "token" }, "room_1", legacy))
      .rejects.toThrow("CHAT2_SUBSCRIPTION_MODE_INVALID");
    expect(legacy).not.toHaveBeenCalled();
  });
  it("cannot create a legacy transport subscription without a signed token", () => {
    expect(() => chat2SubscriptionTransportOptions(
      { channel: "chat2:room_1", mode: "token", token: "" }, async () => "x"))
      .toThrow("CHAT2_LEGACY_TOKEN_MISSING");
  });
});
