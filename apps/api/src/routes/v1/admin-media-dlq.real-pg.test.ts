import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { a3AdminDlqFixture as fixture } from "../../../../../packages/prisma/tests/a3AdminDlqFixture";

vi.mock("@gafus/statistics", () => ({ getStorageStats: vi.fn() }));
import { adminMediaRoutes } from "./admin-media";
import { authMiddleware } from "../../middleware/auth";

const url = process.env.DATABASE_URL ?? "";
if (process.env.GAFUS_A3_ADMIN_DLQ_ISOLATED_QA !== "1" ||
    !/^postgresql:\/\/a3qa@127\.0\.0\.1:\d+\/postgres(?:\?|$)/.test(url)) {
  throw Error("A3_ADMIN_DLQ_REQUIRES_DISPOSABLE_LOOPBACK_POSTGRES");
}
const base = "/api/v1/admin/media/chat-outbox/dead-letters";
const { id } = fixture;
function appWithRole(role: "ADMIN" | "MODERATOR") {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "a3-local-operator", role } as never);
    await next();
  });
  app.route("/api/v1/admin/media", adminMediaRoutes);
  return app;
}
beforeAll(async () => {
  await fixture.reset();
  await fixture.seed(1);
  await fixture.seed(2, { claimed: true });
  await fixture.seed(3, { delivered: true });
  await fixture.seed(4, { dead: false });
});
afterAll(async () => {
  await fixture.reset();
  await fixture.disconnect();
});

describe("actual Hono ADMIN DLQ ACL / real PostgreSQL CAS", () => {
  it("requires real auth middleware before list and retry routes", async () => {
    const app = new Hono();
    app.use("*", authMiddleware);
    app.route("/api/v1/admin/media", adminMediaRoutes);
    expect((await app.request(base)).status).toBe(401);
    expect((await app.request(`${base}/${id(1)}/retry`, { method: "POST" })).status).toBe(401);
    expect((await app.request(base, { headers: { Authorization: "Bearer invalid-local-token" } })).status).toBe(401);
  });

  it("denies moderator GET and POST without changing the database", async () => {
    const app = appWithRole("MODERATOR");
    expect((await app.request(base)).status).toBe(403);
    expect((await app.request(`${base}/${id(1)}/retry`, { method: "POST" })).status).toBe(403);
    expect((await fixture.state(1))?.deadLetteredAt).not.toBeNull();
  });

  it("lists only terminal, undelivered events and excludes internal identifiers", async () => {
    const response = await appWithRole("ADMIN").request(base);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json() as { success: boolean; data: Array<Record<string, unknown>> };
    expect(body.success).toBe(true);
    const found = body.data.filter(item => String(item.id).startsWith("a3_isolated_event_"));
    expect(found.map(item => item.id).sort()).toEqual([id(1), id(2)]);
    for (const entry of found) {
      expect(Object.keys(entry)).not.toContain("conversationId");
      expect(Object.keys(entry)).not.toContain("messageId");
      expect(entry.lastErrorCode).toBe("CHAT2_BROKER_AUTH_DENIED");
    }
  });

  it("rejects claimed, delivered and non-DLQ rows with CAS 409", async () => {
    const app = appWithRole("ADMIN");
    for (const n of [2, 3, 4]) {
      expect((await app.request(`${base}/${id(n)}/retry`, { method: "POST" })).status).toBe(409);
    }
    expect((await app.request(`${base}/x/retry`, { method: "POST" })).status).toBe(400);
  });

  it("allows exactly one concurrent admin retry and resets the retry budget", async () => {
    const app = appWithRole("ADMIN");
    const responses = await Promise.all(Array.from({ length: 6 }, () =>
      app.request(`${base}/${id(1)}/retry`, { method: "POST" }),
    ));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409, 409, 409, 409, 409]);
    const row = await fixture.state(1);
    expect(row).not.toBeNull();
    expect(row!.deadLetteredAt).toBeNull();
    expect(row!.lastErrorCode).toBeNull();
    expect(row!.attempts).toBe(0);
    expect(row!.claimToken).toBeNull();
    expect(row!.claimedUntil).toBeNull();
    expect(row!.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
