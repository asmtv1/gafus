/**
 * AG1-COMM050: mounted actual feedRoutes + authMiddleware + actual Core social.
 * Feed dispatcher seam and Prisma operations are mocked; not full app/real PG.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Test source directly: package @gafus/core export can point at stale dist
// while AG1 agents work without shared rebuilds.
import type { FeedDb } from "../../../../../packages/core/src/services/feed/ports";
import { createFeedSocial } from "../../../../../packages/core/src/services/feed/social";

const m = vi.hoisted(() => ({
  jwt: vi.fn(), dispatch: vi.fn(),
  findUser: vi.fn(), findUsers: vi.fn(), findMany: vi.fn(),
  count: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.jwt }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/feed-server", () => ({
  FEED_MAX_BODY_BYTES: 65_536,
  dispatchFeedRequest: (...args: unknown[]) => m.dispatch(...args),
  feedHttpError: (err: unknown) => {
    const known = err as { status?: number; code?: string; message?: string };
    if (known.status && known.code) {
      return { status: known.status, body: {
        success: false, error: known.message, code: known.code,
      } };
    }
    return { status: 500, body: { success: false, code: "INTERNAL_ERROR", error: "Ошибка" } };
  },
}));
import { authMiddleware } from "../../middleware/auth";
import { feedRoutes } from "./feed";

const A = "USER_A", B = "USER_B";
const VISIBLE = "COMMENT_A", PUSH = "AUTHOR_POST_A", FOREIGN = "COMMENT_B";
const NOW = new Date("2026-10-21T12:00:00Z");
type N = { id: string; recipientId: string; kind: string; readAt: Date | null;
  createdAt: Date; postId: string; commentId: null; actorIds: string[];
  reaction: null; post: { status: string; deletedAt: null; moderationState: string } };
let rows: N[];
const matches = (where: { id?: string; recipientId?: string; readAt?: null;
  kind?: { not: string } }) => rows.filter((n) =>
  (!where.id || where.id === n.id) && (!where.recipientId || where.recipientId === n.recipientId) &&
  (where.readAt === undefined || n.readAt === null) &&
  (!where.kind || n.kind !== where.kind.not)
);
const path = "/api/v1/feed/notifications";
function app() {
  const h = new Hono();
  h.use("/api/v1/feed/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  h.use("/api/v1/feed/*", authMiddleware);
  h.route("/api/v1/feed", feedRoutes);
  return h;
}
const request = (suffix = "", token = "token-A", method = "GET", body?: object) => app().request(
  path + suffix, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  },
);
beforeEach(() => {
  vi.resetAllMocks();
  rows = [VISIBLE, PUSH, FOREIGN].map((id) => ({
    id, recipientId: id === FOREIGN ? B : A,
    kind: id === PUSH ? "author_post" : "comment", readAt: null, createdAt: NOW,
    postId: "POST_" + id, commentId: null, actorIds: [], reaction: null,
    post: { status: "published", deletedAt: null, moderationState: "visible" },
  }));
  m.jwt.mockImplementation(async (jwt: string) =>
    jwt === "token-A" ? { id: A, role: "USER", username: A } :
      jwt === "token-B" ? { id: B, role: "USER", username: B } : null
  );
  m.findUser.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
  }));
  m.findUsers.mockResolvedValue([]);
  m.findMany.mockImplementation(async ({ where }: { where: Parameters<typeof matches>[0] }) =>
    matches(where)
  );
  m.findFirst.mockImplementation(async ({ where }: { where: Parameters<typeof matches>[0] }) =>
    matches(where)[0] ?? null
  );
  m.count.mockImplementation(async ({ where }: { where: Parameters<typeof matches>[0] }) =>
    matches(where).length
  );
  m.updateMany.mockImplementation(async ({ where, data }: {
    where: Parameters<typeof matches>[0]; data: { readAt: Date };
  }) => {
    const matched = matches(where);
    matched.forEach((notice) => { notice.readAt = data.readAt; });
    return { count: matched.length };
  });
  const social = createFeedSocial({
    db: {
      user: { findUnique: m.findUser, findMany: m.findUsers },
      feedNotification: {
        findMany: m.findMany, findFirst: m.findFirst,
        count: m.count, updateMany: m.updateMany,
      },
    } as unknown as FeedDb,
    enabled: () => true,
    now: () => NOW,
  });
  m.dispatch.mockImplementation(async (actor: string, _request: Request, relative: string) => {
    if (relative === "/notifications") return social.listNotifications(actor);
    if (relative === "/notifications/unread-count") return social.unreadCount(actor);
    if (relative === "/notifications/read-all") return social.markAllNotificationsRead(actor);
    if (relative.startsWith("/notifications/")) {
      return social.markNotificationRead(actor, relative.slice("/notifications/".length));
    }
    throw new Error("UNEXPECTED_ROUTE");
  });
});

describe("AG1-COMM050 actual Hono + Core notice visibility", () => {
  it("guest 401 is no-store and never reads notification DB", async () => {
    const r = await request("", "", "GET");
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(m.dispatch).not.toHaveBeenCalled();
  });
  it.each(["token-A", "token-B"])("%s only sees own visible notices", async token => {
    const r = await request("", token);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const data = (await r.json()).data;
    expect(data.items.map((n: { id: string }) => n.id)).toEqual([
      token === "token-A" ? VISIBLE : FOREIGN,
    ]);
    expect(m.dispatch).toHaveBeenCalledWith(
      token === "token-A" ? A : B, expect.any(Request), "/notifications",
    );
  });
  it("notification actor payload only includes public name/avatar, no private details", async () => {
    rows[0]!.actorIds = ["PUBLIC_ACTOR"];
    m.findUsers.mockResolvedValueOnce([{
      id: "PUBLIC_ACTOR", username: "author",
      profile: { fullName: "Public author", avatarUrl: null },
      email: "PRIVATE_AUTHOR_EMAIL", phone: "PRIVATE_AUTHOR_PHONE",
    }]);
    const r = await request();
    expect(r.status).toBe(200);
    const result = await r.json();
    expect(result.data.items[0].actors).toEqual([{
      id: "PUBLIC_ACTOR", username: "author", name: "Public author", avatarUrl: null,
    }]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_AUTHOR_");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("same mounted Hono app A→B→A preserves recipient and per-actor unread", async () => {
    const h = app();
    for (const [token, expected] of [
      ["token-A", VISIBLE], ["token-B", FOREIGN], ["token-A", VISIBLE],
    ]) {
      const res = await h.request(path, {
        headers: { Authorization: "Bearer " + token },
      });
      expect(res.status).toBe(200);
      expect((await res.json()).data.items.map((item: { id: string }) => item.id)).toEqual([
        expected,
      ]);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    const bRead = await h.request(path + "/" + FOREIGN, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-B", "Content-Type": "application/json",
      },
      body: JSON.stringify({ read: true }),
    });
    expect(bRead.status).toBe(200);
    const aUnread = await h.request(path + "/unread-count", {
      headers: { Authorization: "Bearer token-A" },
    });
    expect(await aUnread.json()).toEqual({ success: true, data: { count: 1 } });
    const bUnread = await h.request(path + "/unread-count", {
      headers: { Authorization: "Bearer token-B" },
    });
    expect(await bUnread.json()).toEqual({ success: true, data: { count: 0 } });
    expect(rows[1]?.readAt).toBeNull();
  });

  it("hidden push-only notification cannot be PATCHed even by recipient", async () => {
    const r = await request("/" + PUSH, "token-A", "PATCH", { read: true });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ success: false, code: "NOT_FOUND" });
    expect(rows[1]?.readAt).toBeNull();
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("foreign notification PATCH stays 404 with unchanged unread", async () => {
    const r = await request("/" + FOREIGN, "token-A", "PATCH", { read: true });
    expect(r.status).toBe(404);
    expect(rows[2]?.readAt).toBeNull();
  });
  it("own normal notification PATCH remains 200 idempotent", async () => {
    const first = await request("/" + VISIBLE, "token-A", "PATCH", { read: true });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      success: true, data: { id: VISIBLE, readAt: NOW.toISOString() },
    });
    const again = await request("/" + VISIBLE, "token-A", "PATCH", { read: true });
    expect(again.status).toBe(200);
    expect(rows[0]?.readAt).toEqual(NOW);
  });
  it("unread count excludes push-only; read-all only marks visible, twice safe", async () => {
    const pre = await request("/unread-count");
    expect(pre.status).toBe(200);
    expect(await pre.json()).toEqual({ success: true, data: { count: 1 } });
    const first = await request("/read-all", "token-A", "POST", {});
    expect(await first.json()).toEqual({ success: true, data: { count: 1 } });
    const second = await request("/read-all", "token-A", "POST", {});
    expect(await second.json()).toEqual({ success: true, data: { count: 0 } });
    expect(rows[1]?.readAt).toBeNull();
    expect(rows[2]?.readAt).toBeNull();
  });
  it("unexpected private Core exception has safe 500 error and no-store", async () => {
    m.dispatch.mockRejectedValueOnce(new Error("PRIVATE_STUDENT_NOTICE_CONTENT"));
    const r = await request();
    expect(r.status).toBe(500);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await r.json())).not.toContain("PRIVATE_STUDENT_NOTICE_CONTENT");
  });
});
