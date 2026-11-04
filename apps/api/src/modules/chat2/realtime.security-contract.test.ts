/** Synthetic JWT and WS URL policy: no broker, database or user details. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";
const access = vi.hoisted(() => ({ readGate: vi.fn() }));
vi.mock("./service.js", () => ({
  Chat2Error: class Chat2Error extends Error {
    constructor(public readonly code: string, public readonly status: number, message: string) {
      super(message);
    }
  },
  readGate: access.readGate,
}));
import { connectToken, subscriptionToken } from "./realtime";
const secret = "chat2-qa-synthetic-32-character-key-no-real-secrets";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHAT2_CENTRIFUGO_TOKEN_SECRET", secret);
  vi.stubEnv("CHAT2_PUBLIC_WS_URL", "wss://gafus.ru/connection/websocket");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_ENABLED", "false");
  access.readGate.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("Chat2 outbound WebSocket JWT destination and authorization", () => {
  it.each(["wss://gafus.ru/connection/websocket", "wss://www.gafus.ru/connection/websocket"])(
    "produces issuer-scoped five-minute JWT only for trusted production WS endpoint %s", async url => {
      vi.stubEnv("CHAT2_PUBLIC_WS_URL", url);
      const connection = await connectToken("synthetic-user");
      expect(connection.wsUrl).toBe(url);
      const result = await jwtVerify(connection.token, new TextEncoder().encode(secret),
        { issuer: "gafus-chat2", algorithms: ["HS256"] });
      expect(result.payload.sub).toBe("synthetic-user");
      expect((result.payload.exp ?? 0) - (result.payload.iat ?? 0)).toBe(300);
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
  ])("does not return a signed connection JWT to %s", async url => {
    vi.stubEnv("CHAT2_PUBLIC_WS_URL", url);
    await expect(connectToken("synthetic-user"))
      .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE", status: 503 });
  });
  it("preserves the legacy /realtime/connect response shape with proxy mode disabled", async () => {
    const connection = await connectToken("synthetic-user");
    expect(Object.keys(connection).sort()).toEqual(["token", "wsUrl"]);
    expect("subscriptionMode" in connection).toBe(false);
  });
  it("advertises opt-in proxy mode only with a dedicated broker-to-API credential", async () => {
    vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_ENABLED", "true");
    vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET", "private-qa-proxy-secret-with-40chars-test-only");
    const connection = await connectToken("synthetic-user");
    expect(connection).toMatchObject({ subscriptionMode: "proxy" });
    expect(await jwtVerify(connection.token, new TextEncoder().encode(secret),
      { issuer: "gafus-chat2", algorithms: ["HS256"] })).toMatchObject({
      payload: { sub: "synthetic-user" },
    });
  });
  it("fails closed when proxy mode is enabled without broker authentication config", async () => {
    vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_ENABLED", "true");
    vi.stubEnv("CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET", "short");
    await expect(connectToken("synthetic-user"))
      .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE", status: 503 });
  });
  it("rejects an absent or undersized signing secret even at a trusted endpoint", async () => {
    vi.stubEnv("CHAT2_CENTRIFUGO_TOKEN_SECRET", "short");
    await expect(connectToken("synthetic-user"))
      .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE", status: 503 });
  });
  it("keeps localhost ws available only for explicit nonproduction localhost", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CHAT2_PUBLIC_WS_URL", "ws://127.0.0.1:8039/connection/websocket");
    expect((await connectToken("synthetic-user")).wsUrl)
      .toBe("ws://127.0.0.1:8039/connection/websocket");
    vi.stubEnv("CHAT2_PUBLIC_WS_URL", "ws://external.example/connection/websocket");
    await expect(connectToken("synthetic-user"))
      .rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE" });
  });
  it("checks room entitlement before issuing each short-lived channel token, including revocation", async () => {
    const initial = await subscriptionToken("synthetic-user", "synthetic-room");
    expect(initial.channel).toBe("chat2:synthetic-room");
    const result = await jwtVerify(initial.token, new TextEncoder().encode(secret),
      { issuer: "gafus-chat2", algorithms: ["HS256"] });
    expect(result.payload.channel).toBe("chat2:synthetic-room");
    expect((result.payload.exp ?? 0) - (result.payload.iat ?? 0)).toBe(60);
    expect(access.readGate).toHaveBeenCalledWith("synthetic-user", "synthetic-room");
    access.readGate.mockRejectedValueOnce({ code: "NOT_FOUND", status: 404 });
    await expect(subscriptionToken("synthetic-user", "synthetic-room"))
      .rejects.toMatchObject({ status: 404 });
    expect(access.readGate).toHaveBeenCalledTimes(2);
  });
});
