import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocked = vi.hoisted(() => ({
  list: vi.fn(),
  retry: vi.fn(),
}));
vi.mock("@gafus/statistics", () => ({ getStorageStats: vi.fn() }));
vi.mock("../../modules/chat2/infrastructure/outbox-diagnostics.js", () => ({
  listChatOutboxDeadLetters: mocked.list,
  retryChatOutboxDeadLetter: mocked.retry,
}));
import { adminMediaRoutes } from "./admin-media";

function appWithRole(role: "ADMIN" | "MODERATOR") {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "actor-id", role } as never);
    await next();
  });
  app.route("/api/v1/admin/media", adminMediaRoutes);
  return app;
}
const endpoint = "/api/v1/admin/media/chat-outbox/dead-letters";

describe("ADMIN-only Chat2 DLQ routes", () => {
  it("denies non-admin access to list and individual retry", async () => {
    const app = appWithRole("MODERATOR");
    expect((await app.request(endpoint)).status).toBe(403);
    expect((await app.request(endpoint + "/evt_1234567890/retry", { method: "POST" })).status).toBe(403);
    expect(mocked.list).not.toHaveBeenCalled();
    expect(mocked.retry).not.toHaveBeenCalled();
  });
  it("provides only redacted bounded diagnostics to ADMIN", async () => {
    mocked.list.mockResolvedValueOnce([{
      id: "evt_1234567890", eventType: "message.created", attempts: 8,
      lastErrorCode: "CHAT2_BROKER_AUTH_DENIED", operationId: "op1", traceId: "a".repeat(32),
      createdAt: new Date(), deadLetteredAt: new Date(),
    }]);
    const result = await appWithRole("ADMIN").request(endpoint);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    const body = await result.text();
    expect(body).not.toContain("conversationId");
    expect(body).not.toContain("messageId");
    expect(body).not.toContain("objectKey");
    expect(body).toContain("CHAT2_BROKER_AUTH_DENIED");
  });
  it("rejects unsafe IDs and no longer terminal records", async () => {
    const app = appWithRole("ADMIN");
    expect((await app.request(endpoint + "/a/retry", { method: "POST" })).status).toBe(400);
    expect(mocked.retry).not.toHaveBeenCalled();
    mocked.retry.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await app.request(endpoint + "/evt_1234567890/retry", { method: "POST" })).status).toBe(409);
    expect((await app.request(endpoint + "/evt_1234567890/retry", { method: "POST" })).status).toBe(200);
  });
});
