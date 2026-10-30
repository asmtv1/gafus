/** Opt-in actual Hono JWT + Chat2 route contract using only disposable PostgreSQL. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { chatsRoutes } from "../../routes/v1/chats";
const enabled = process.env.GAFUS_CHAT2_HTTP_ACCEPTANCE === "enabled";
const api = new Hono();
api.use("/api/v1/chats", authMiddleware);
api.use("/api/v1/chats/*", authMiddleware);
api.route("/api/v1/chats", chatsRoutes);
let creator = "",
  reader = "",
  outsider = "",
  room = "",
  sentMessageId = "";
const inserted: string[] = [];
const tokens: Record<string, string> = {};
const endpoint = "http://127.0.0.1:55432/api/v1/chats";
const call = (who: string, method: "GET" | "POST", path: string, body?: unknown) =>
  api.request(endpoint + path, {
    method,
    headers: {
      ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
describe.skipIf(!enabled)("Chat2 Hono JWT routes with isolated real PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "https://invalid.test");
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55432" ||
      url.pathname !== "/chat2_integration"
    )
      throw new Error("UNSAFE_CHAT2_DB_TARGET");
    const rows = await prisma.$queryRawUnsafe<{ d: string }[]>(
      "SELECT current_setting('data_directory') AS d",
    );
    if (rows[0]?.d !== "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/chat2-db")
      throw new Error("UNSAFE_CHAT2_DB_ROOT");
    process.env.JWT_SECRET = randomBytes(48).toString("hex");
    for (const kind of ["a", "b", "c"]) {
      const u = await prisma.user.create({
        data: { username: `chat2http_${kind}_${Date.now()}`, password: "test-only" },
        select: { id: true, username: true, role: true },
      });
      inserted.push(u.id);
      tokens[u.id] = await generateAccessToken({ id: u.id, username: u.username, role: u.role });
    }
    [creator, reader, outsider] = inserted;
  });
  afterAll(async () => {
    if (inserted.length) {
      await prisma.chat2Conversation.deleteMany({ where: { createdById: { in: inserted } } });
      await prisma.user.deleteMany({ where: { id: { in: inserted } } });
    }
    await prisma.$disconnect();
  });
  it("does not disclose private chats to guests", async () => {
    expect((await call("anonymous", "GET", "/discover")).status).toBe(401);
  });
  it("creates and reads a DIRECT only for its two users", async () => {
    const res = await call(creator, "POST", "/direct", { userId: reader });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: { conversationId: string } };
    expect(body.success).toBe(true);
    room = body.data.conversationId;
    const target = await prisma.user.findUniqueOrThrow({
      where: { id: reader }, select: { username: true },
    });
    const byUsername = await call(creator, "POST", "/direct", { username: target.username });
    expect(byUsername.status).toBe(201);
    expect(((await byUsername.json()) as { data: { conversationId: string } }).data.conversationId)
      .toBe(room);
    expect((await call(reader, "GET", `/${room}`)).status).toBe(200);
    expect((await call(outsider, "GET", `/${room}`)).status).toBe(404);
  });
  it("rejects invalid payloads instead of forwarding unvalidated fields", async () => {
    expect((await call(creator, "POST", "/direct", { userId: reader, role: "OWNER" })).status).toBe(
      400,
    );
    expect((await call(creator, "POST", "/direct", {
      username: "invalid/name",
    })).status).toBe(400);
    expect(
      (
        await call(creator, "POST", `/${room}/messages`, {
          clientMessageId: randomUUID(),
          text: "",
        })
      ).status,
    ).toBe(400);
  });
  it("sends one message, returns JSON-safe sequence, and prevents foreign user read", async () => {
    const message = await call(creator, "POST", `/${room}/messages`, {
      clientMessageId: randomUUID(),
      text: "Hono HTTP chat2",
    });
    expect(message.status).toBe(201);
    const value = (await message.json()) as { data: { sequence: string; id: string } };
    sentMessageId = value.data.id;
    expect(value.data.sequence).toMatch(/^\d+$/);
    const timeline = await call(reader, "GET", `/${room}/messages`);
    expect(timeline.status).toBe(200);
    const result = (await timeline.json()) as { data: { id: string }[] };
    expect(result.data.some((x) => x.id === value.data.id)).toBe(true);
    expect((await call(outsider, "GET", `/${room}/messages`)).status).toBe(404);
  });
  it("moderates personal-chat reports via real JWT, real PostgreSQL and staff HTTP endpoints", async () => {
    expect(sentMessageId).toBeTruthy();
    const complaint = await call(reader, "POST", `/${room}/messages/${sentMessageId}/report`, {
      reason: "SPAM", comment: "Only disposable isolated report data",
    });
    expect(complaint.status).toBe(201);
    const { data: reported } = await complaint.json() as {
      data: { reported: boolean; reportId: string };
    };
    expect(reported.reported).toBe(true);
    const reportId = reported.reportId;
    expect((await call(reader, "GET", "/moderation/reports")).status).toBe(403);
    expect((await call(reader, "POST", `/moderation/reports/${reportId}/resolve`, {
      status: "RESOLVED",
    })).status).toBe(403);
    // Middleware also requires a JWT whose role still matches the current DB role.
    // Promote only the disposable fixture and sign a matching token for staff access.
    const originalToken = tokens[outsider];
    const promoted = await prisma.user.update({
      where: { id: outsider }, data: { role: "MODERATOR" },
      select: { id: true, username: true, role: true },
    });
    tokens[outsider] = await generateAccessToken(promoted);
    try {
      const queue = await call(outsider, "GET", "/moderation/reports");
      expect(queue.status).toBe(200);
      const payload = await queue.json() as { data: {
        id: string; reason: string; comment: string;
        conversation: { kind: string; id: string };
        message: { text: string };
      }[] };
      const found = payload.data.find((item) => item.id === reportId);
      expect(found).toMatchObject({
        reason: "SPAM", comment: "Only disposable isolated report data",
        conversation: { id: room, kind: "DIRECT" },
        message: { text: "Hono HTTP chat2" },
      });
      expect(found).not.toHaveProperty("reporterId");
      const resolve = await call(outsider, "POST", `/moderation/reports/${reportId}/resolve`, {
        status: "RESOLVED",
      });
      expect(resolve.status).toBe(200);
      expect((await resolve.json()) as unknown).toEqual({ success: true, data: { done: true } });
      expect((await prisma.chat2Report.findUniqueOrThrow({
        where: { id: reportId }, select: { status: true },
      })).status).toBe("RESOLVED");
      expect((await call(outsider, "POST", `/moderation/reports/${reportId}/resolve`, {
        status: "REJECTED",
      })).status).toBe(404);
      const after = await call(outsider, "GET", "/moderation/reports");
      expect(after.status).toBe(200);
      const remaining = await after.json() as { data: { id: string }[] };
      expect(remaining.data.some((item) => item.id === reportId)).toBe(false);
    } finally {
      await prisma.user.update({ where: { id: outsider }, data: { role: "USER" } });
      tokens[outsider] = originalToken;
    }
  });
});
