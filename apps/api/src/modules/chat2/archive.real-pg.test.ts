/** Opt-in isolated-only import acceptance, no external provider calls. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { importArchiveIntoIsolatedDatabase } from "./archive";
const enabled = process.env.GAFUS_CHAT2_ARCHIVE_TEST === "enabled";
const inserted: string[] = [];
let conversationId = "";
let archive: unknown;
describe.skipIf(!enabled)("Chat2 offline history import on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "https://invalid.local");
    if (
      u.hostname !== "127.0.0.1" ||
      u.port !== "55432" ||
      u.pathname !== "/chat2_integration" ||
      u.username !== "chat2_dev"
    )
      throw new Error("UNSAFE_DB_URL");
    const rows = await prisma.$queryRawUnsafe<{ d: string }[]>(
      "SELECT current_setting('data_directory') AS d",
    );
    if (rows[0]?.d !== "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/chat2-db")
      throw new Error("UNSAFE_DB_ROOT");
    const seed = Date.now().toString(36);
    for (const role of ["author", "partner"]) {
      const u = await prisma.user.create({
        data: { username: `arch_${role}_${seed}`, password: "local-no-login" },
        select: { id: true },
      });
      inserted.push(u.id);
    }
    archive = {
      format: "gafus-chat2-archive-v1",
      conversations: [
        {
          kind: "DIRECT",
          sourceId: "stream-export-synthetic",
          members: inserted,
          messages: [
            {
              sourceId: "reply-first",
              authorId: inserted[1],
              text: "Ответ",
              createdAt: "2026-10-19T18:02:00.000Z",
              replyToSourceId: "root-second",
            },
            {
              sourceId: "root-second",
              authorId: inserted[0],
              text: "Начало разговора",
              createdAt: "2026-10-19T18:02:00.000Z",
            },
          ],
        },
      ],
    };
  });
  afterAll(async () => {
    if (inserted.length) {
      if (conversationId) await prisma.chat2Conversation.delete({ where: { id: conversationId } });
      await prisma.user.deleteMany({ where: { id: { in: inserted } } });
    }
    await prisma.$disconnect();
  });
  it("imports original dates, message order, and stable replies without an outbox blast", async () => {
    const result = await importArchiveIntoIsolatedDatabase(archive);
    expect(result).toMatchObject({ messages: 2, imported: 2, skipped: 0 });
    const c = await prisma.chat2Conversation.findUniqueOrThrow({
      where: { directKey: `dm:${[...inserted].sort().join(":")}` },
    });
    conversationId = c.id;
    const messages = await prisma.chat2Message.findMany({
      where: { conversationId },
      orderBy: { sequence: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].createdAt.toISOString()).toBe("2026-10-19T18:02:00.000Z");
    expect(messages[0].replyToId).toBe(messages[1].id);
    expect(await prisma.chat2OutboxEvent.count({ where: { conversationId } })).toBe(0);
  });
  it("replay is idempotent and detects content tampering", async () => {
    const res = await importArchiveIntoIsolatedDatabase(archive);
    expect(res).toMatchObject({ imported: 0, skipped: 2 });
    expect(await prisma.chat2Message.count({ where: { conversationId } })).toBe(2);
    const changed = structuredClone(archive) as any;
    changed.conversations[0].messages[0].text = "Переиначено";
    await expect(importArchiveIntoIsolatedDatabase(changed)).rejects.toThrow(
      "ARCHIVE_MESSAGE_CONFLICT",
    );
  });
});
