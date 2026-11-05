/** Synthetic connection JWT and fail-closed proxy-only policy, no broker/DB. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";
vi.mock("./service.js", () => ({
  Chat2Error: class Chat2Error extends Error {
    constructor(public readonly code: string, public readonly status: number, message: string) {
      super(message);
    }
  },
}));
import { connectToken } from "./realtime";
const secret = "chat2-qa-synthetic-32-character-key-no-real-secrets";
const proxySecret = "synthetic-broker-proxy-only-unique-32-plus-chars";
const apiKey = "synthetic-broker-management-api-key-unique-32-plus";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHAT2_CENTRIFUGO_TOKEN_SECRET", secret);
  vi.stubEnv("CHAT2_CENTRIFUGO_API_KEY", apiKey);
  vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET", proxySecret);
  vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_ENABLED", "true");
  vi.stubEnv("CHAT2_PUBLIC_WS_URL", "wss://gafus.ru/connection/websocket");
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());
describe("Chat2 proxy-only JWT and ACL enforcement", () => {
  it.each(["wss://gafus.ru/connection/websocket", "wss://www.gafus.ru/connection/websocket"])(
    "issues ONLY a connection JWT for trusted WS endpoint %s", async url => {
      vi.stubEnv("CHAT2_PUBLIC_WS_URL", url);
      const connection = await connectToken("synthetic-user");
      expect(connection).toEqual(expect.objectContaining({ wsUrl: url, subscriptionMode: "proxy" }));
      const jwt = await jwtVerify(connection.token, new TextEncoder().encode(secret),
        { issuer: "gafus-chat2", algorithms: ["HS256"] });
      expect(jwt.payload.sub).toBe("synthetic-user");
      expect((jwt.payload.exp ?? 0) - (jwt.payload.iat ?? 0)).toBe(300);
      expect(jwt.payload.channel).toBeUndefined();
      expect(jwt.payload.channels).toBeUndefined();
      expect(jwt.payload.subs).toBeUndefined();
    },
  );
  it.each([
    "wss://evil.example/connection/websocket",
    "wss://gafus.ru.evil.example/connection/websocket",
    "wss://gafus.ru/other/connection/websocket",
    "wss://gafus.ru/connection/websocket?token=intercept",
    "wss://gafus.ru/connection/websocket#redirect",
    "wss://user:password@gafus.ru/connection/websocket",
    "ws://gafus.ru/connection/websocket",
  ])("refuses issuing a connection JWT to %s", async url => {
    vi.stubEnv("CHAT2_PUBLIC_WS_URL", url);
    await expect(connectToken("synthetic-user"))
      .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE", status: 503 });
  });
  it.each([undefined, "false", "disabled", "token"])(
    "refuses absent or disabled proxy config %s, no legacy fallback", async state => {
      vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_ENABLED", state);
      await expect(connectToken("synthetic-user"))
        .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE", status: 503 });
    },
  );
  it("refuses missing, short or duplicate connection / broker authentication keys", async () => {
    for (const [key,value] of [
      ["CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET", "short"],
      ["CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET", secret],
      ["CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET", apiKey],
      ["CHAT2_CENTRIFUGO_TOKEN_SECRET", "short"],
      ["CHAT2_CENTRIFUGO_API_KEY", secret],
    ] as const) {
      vi.stubEnv(key,value);
      await expect(connectToken("synthetic-user"))
        .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE", status: 503 });
      vi.stubEnv(key,key==="CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET"?proxySecret:
        key==="CHAT2_CENTRIFUGO_TOKEN_SECRET"?secret:apiKey);
    }
  });
  it("accepts local WS only outside production, but still requires proxy-only", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CHAT2_PUBLIC_WS_URL", "ws://127.0.0.1:8039/connection/websocket");
    expect((await connectToken("synthetic-user")).subscriptionMode).toBe("proxy");
    vi.stubEnv("CHAT2_PUBLIC_WS_URL", "ws://external.example/connection/websocket");
    await expect(connectToken("synthetic-user"))
      .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE" });
  });
});
