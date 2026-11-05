import { describe, expect, it } from "vitest";
import { chat2SubscriptionForConnection, chat2SubscriptionTransportOptions } from "./realtimeSubscription";

const connection = { token: "connection-only-jwt", wsUrl: "wss://gafus.ru/connection/websocket", subscriptionMode: "proxy" as const };

describe("proxy-only Chat2 shared Web/Mobile handshake", () => {
  it("gives no channel token or refresh callback on either client or reconnect", async () => {
    for (const consumer of ["web", "mobile", "reconnect"] as const) {
      const grant = await chat2SubscriptionForConnection(connection, "room_1");
      expect(grant).toEqual({ mode: "proxy", channel: "chat2:room_1" });
      const options = chat2SubscriptionTransportOptions(grant);
      expect(options).toEqual({});
      expect(Object.hasOwn(options, "token")).toBe(false);
      expect(Object.hasOwn(options, "getToken")).toBe(false);
      expect(consumer).toBeTruthy();
    }
  });
  it.each([undefined, "token", "legacy", "jwt", null, false, "future"])(
    "refuses old or missing broker mode %s rather than falling back", async mode => {
      await expect(chat2SubscriptionForConnection(
        { ...connection, subscriptionMode: mode } as typeof connection,
        "room_1",
      )).rejects.toThrow("CHAT2_PROXY_ONLY_REQUIRED");
    },
  );
  it.each(["../room", "", "room:other", "x".repeat(129)])(
    "rejects untrusted room identifier %s", async room => {
      await expect(chat2SubscriptionForConnection(connection, room))
        .rejects.toThrow("CHAT2_ROOM_ID_INVALID");
    },
  );
  it("refuses a spoofed token-mode subscription at runtime", () => {
    expect(() => chat2SubscriptionTransportOptions(
      { channel: "chat2:room_1", mode: "token", token: "old-signed-room-jwt" } as never,
    )).toThrow("CHAT2_PROXY_ONLY_REQUIRED");
  });
  it("refuses a cross-channel or malformed proxy transport", () => {
    expect(() => chat2SubscriptionTransportOptions(
      { channel: "other:room_1", mode: "proxy" },
    )).toThrow("CHAT2_PROXY_ONLY_REQUIRED");
  });
});
