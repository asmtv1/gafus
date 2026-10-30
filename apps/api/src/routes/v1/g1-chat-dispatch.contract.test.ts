/** G1 characterization of actual Hono wildcard routes, Core/Stream mocked.
 * No Redis, Stream Chat, PostgreSQL, queues or production network I/O.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(), isRegistrationCompleted: vi.fn(),
  dispatchChatRequest: vi.fn(), acceptChatWebhook: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: mock.verifyAccessToken }));
vi.mock("@gafus/core/services/auth", () => ({
  isRegistrationCompleted: mock.isRegistrationCompleted,
}));
vi.mock("@gafus/chat-server", async importOriginal => ({
  ...(await importOriginal<object>()), dispatchChatRequest: mock.dispatchChatRequest,
}));
vi.mock("@gafus/core/services/cynologistChat", async importOriginal => ({
  ...(await importOriginal<object>()), acceptChatWebhook: mock.acceptChatWebhook,
}));

import { ChatError } from "@gafus/core/services/cynologistChat";
import { authMiddleware } from "../../middleware/auth";
import { communityChatRoutes } from "./community-chat";
import { cynologistChatRoutes, streamChatWebhookRoutes } from "./cynologist-chat";

const A = { id: "actor-A", username: "alpha", role: "USER" } as const;
const B = { id: "actor-B", username: "beta", role: "USER" } as const;
function app() {
  const h = new Hono();
  for (const prefix of ["/api/v1/community-chat", "/api/v1/cynologist-chat"]) {
    h.use(prefix, authMiddleware);
    h.use(`${prefix}/*`, authMiddleware);
  }
  h.route("/api/v1/community-chat", communityChatRoutes);
  h.route("/api/v1/cynologist-chat", cynologistChatRoutes);
  // Matches app.ts: raw webhook intentionally does NOT require GAFUS JWT.
  h.route("/api/v1/stream-chat/webhook", streamChatWebhookRoutes);
  return h;
}
function chat(path: string, method = "GET", body?: string, headers: Record<string, string> = {}) {
  return app().request(`http://local.test/api/v1/${path}`, {
    method,
    headers: { authorization: "Bearer expo-test-token", ...headers },
    ...(body === undefined ? {} : { body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.verifyAccessToken.mockResolvedValue(A);
  mock.isRegistrationCompleted.mockResolvedValue(true);
  mock.dispatchChatRequest.mockResolvedValue({ canRead: true });
  mock.acceptChatWebhook.mockResolvedValue(undefined);
});

describe("G1 chat wildcard route contract with real auth middleware", () => {
  it.each(["community-chat", "cynologist-chat"])(
    "%s rejects missing Bearer before dispatch", async prefix => {
      const r = await app().request(`http://local.test/api/v1/${prefix}/messages`);
      expect(r.status).toBe(401);
      expect(mock.dispatchChatRequest).not.toHaveBeenCalled();
    },
  );

  it("expired JWT does not dispatch private messages", async () => {
    mock.verifyAccessToken.mockResolvedValueOnce(null);
    const r = await chat("cynologist-chat/messages", "POST", "{}");
    expect(r.status).toBe(401);
    expect(mock.dispatchChatRequest).not.toHaveBeenCalled();
  });

  it("incomplete registration cannot fetch community chat", async () => {
    mock.isRegistrationCompleted.mockResolvedValueOnce(false);
    const r = await chat("community-chat");
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ success: false, code: "REGISTRATION_PENDING" });
    expect(mock.dispatchChatRequest).not.toHaveBeenCalled();
  });

  it("community GET forwards JWT identity, blank action and community=true", async () => {
    const r = await chat("community-chat");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: { canRead: true } });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mock.dispatchChatRequest).toHaveBeenCalledWith(
      A.id, expect.any(Request), "", true,
    );
  });

  it("native Bearer community mutation forwards messages action and true flag", async () => {
    const r = await chat("community-chat/messages", "POST", JSON.stringify({ userId: B.id }));
    expect(r.status).toBe(200);
    expect(mock.dispatchChatRequest).toHaveBeenCalledWith(
      A.id, expect.objectContaining({ method: "POST" }), "messages", true,
    );
  });

  it("private chat GET scopes user and delegates validated chatId to dispatcher", async () => {
    // Root route can trigger two overlapping auth middleware registrations.
    mock.verifyAccessToken.mockResolvedValue(B);
    const r = await chat("cynologist-chat?chatId=chat-B");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mock.dispatchChatRequest).toHaveBeenCalledWith(B.id, expect.any(Request), "");
    const raw = mock.dispatchChatRequest.mock.calls[0]?.[1] as Request;
    expect(new URL(raw.url).searchParams.get("chatId")).toBe("chat-B");
  });

  it("DELETE attachments is forwarded to dispatcher with actor and raw method", async () => {
    const r = await chat("cynologist-chat/attachments?chatId=chat-A&attachmentId=file-A", "DELETE");
    expect(r.status).toBe(200);
    expect(mock.dispatchChatRequest).toHaveBeenCalledWith(
      A.id, expect.objectContaining({ method: "DELETE" }), "attachments",
    );
  });

  it("forged browser Origin cannot send chat messages before dispatcher", async () => {
    const r = await app().request("http://local.test/api/v1/community-chat/messages", {
      method: "POST", headers: {
        cookie: "gafus_access=test-jwt", origin: "https://attacker.invalid",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(r.status).toBe(403);
    expect(mock.verifyAccessToken).not.toHaveBeenCalled();
    expect(mock.dispatchChatRequest).not.toHaveBeenCalled();
  });

  it("maps ChatError rate limit to existing 429 machine code and no-store", async () => {
    mock.dispatchChatRequest.mockRejectedValueOnce(
      new ChatError("CHAT_RATE_LIMIT", "Слишком много запросов", 429),
    );
    const r = await chat("community-chat/messages", "POST", "{}");
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ success: false, code: "CHAT_RATE_LIMIT" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("maps unknown dispatcher failures to generic 503 with no secret in body", async () => {
    mock.dispatchChatRequest.mockRejectedValueOnce(new Error("TEST_CHAT_SECRET_VALUE"));
    const r = await chat("cynologist-chat");
    expect(r.status).toBe(503);
    const payload = await r.text();
    expect(JSON.parse(payload)).toMatchObject({ success: false, code: "CHAT_UNAVAILABLE" });
    expect(payload).not.toContain("TEST_CHAT_SECRET_VALUE");
  });
});

describe("G1 Stream Chat Hono webhook: raw body/signature boundary", () => {
  it("is not accessible through GET", async () => {
    const r = await app().request("http://local.test/api/v1/stream-chat/webhook");
    expect(r.status).toBe(404);
    expect(mock.acceptChatWebhook).not.toHaveBeenCalled();
  });

  it("passes raw body and x-signature unchanged to signature-verifying Core", async () => {
    const raw = '{ "type": "message.new", "message": {"id": "id"} }';
    const r = await app().request("http://local.test/api/v1/stream-chat/webhook", {
      method: "POST", headers: { "x-signature": "test-signature" }, body: raw,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true });
    expect(mock.acceptChatWebhook).toHaveBeenCalledWith(raw, "test-signature");
  });

  it("rejects >65536-byte webhook before Core", async () => {
    const r = await app().request("http://local.test/api/v1/stream-chat/webhook", {
      method: "POST", body: "x".repeat(65537),
    });
    expect(r.status).toBe(413);
    expect(mock.acceptChatWebhook).not.toHaveBeenCalled();
  });

  it("missing signature is passed as empty to Core, which returns 401", async () => {
    mock.acceptChatWebhook.mockRejectedValueOnce(
      new ChatError("INVALID_SIGNATURE", "Неверная подпись", 401),
    );
    const r = await app().request("http://local.test/api/v1/stream-chat/webhook", {
      method: "POST", body: "{}",
    });
    expect(mock.acceptChatWebhook).toHaveBeenCalledWith("{}", "");
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ success: false, code: "INVALID_SIGNATURE" });
  });

  it("signature service error does not reveal private verification details", async () => {
    mock.acceptChatWebhook.mockRejectedValueOnce(new Error("HMAC_SECRET_TEST_VALUE"));
    const r = await app().request("http://local.test/api/v1/stream-chat/webhook", {
      method: "POST", headers: { "x-signature": "incorrect" }, body: "{}",
    });
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("HMAC_SECRET_TEST_VALUE");
  });
});
