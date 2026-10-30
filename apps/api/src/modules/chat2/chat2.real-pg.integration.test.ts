/** Explicit opt-in. Abort before any DB mutation unless pointing to the isolated Refactor PG cluster. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  Chat2Error,
  joinGroup,
  leaveChat,
  listChats,
  messages,
  openDirect,
  sendMessage,
  readGate,
  markRead,
  blockUser,
  inviteMember,
  openCourse,
  openCommunity,
  moderateGroup,
  updateGroup,
  transferGroupOwner,
  createGroup,
  reportChatMessage,
  listChatReports,
  resolveChatReport,
  listStaffChatReports,
  resolveStaffChatReport,
} from "./service";
const enabled = process.env.GAFUS_CHAT2_REAL_PG_ACCEPTANCE === "enabled";
const root = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/chat2-db";
const created: string[] = [];
let actor = "",
  other = "",
  stranger = "",
  dm = "",
  group = "",
  courseId = "";
const request = () => crypto.randomUUID();
const verified = async () => {
  const url = new URL(process.env.DATABASE_URL ?? "https://unconfigured.invalid");
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/chat2_integration" ||
    url.username !== "chat2_dev"
  )
    throw new Error("UNSAFE_CHAT2_PG_URL");
  const records = await prisma.$queryRawUnsafe<{ setting: string }[]>(
    "SELECT current_setting('data_directory') AS setting",
  );
  if (records[0]?.setting !== root) throw new Error("UNSAFE_CHAT2_PG_ROOT");
};
describe.skipIf(!enabled)("Chat2 real isolated PostgreSQL acceptance", () => {
  beforeAll(async () => {
    await verified();
    const seed = Date.now().toString(36);
    for (const slug of ["owner", "peer", "outsider"]) {
      const user = await prisma.user.create({
        data: {
          username: `chat2_${slug}_${seed}`,
          email: `chat2_${slug}_${seed}@example.invalid`,
          password: "test-only-no-login",
        },
        select: { id: true },
      });
      created.push(user.id);
    }
    [actor, other, stranger] = created;
  });
  afterAll(async () => {
    if (!created.length) return;
    await verified();
    // Course is a separate durable entity and must be cleaned before its author.
    if (courseId) await prisma.course.deleteMany({ where: { id: courseId } });
    // Cleanup only users created in this acceptance test inside the isolated cluster.
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });
  it("creates one canonical DIRECT even after repeated opens", async () => {
    const a = await openDirect(actor, other),
      b = await openDirect(other, actor);
    expect(b.conversationId).toBe(a.conversationId);
    dm = a.conversationId;
    const count = await prisma.chat2Conversation.count({ where: { id: dm } });
    expect(count).toBe(1);
    expect(await prisma.chat2Member.count({ where: { conversationId: dm } })).toBe(2);
  });
  it("simultaneous DIRECT open from both participants does not create duplicates", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        i % 2 ? openDirect(other, actor) : openDirect(actor, other),
      ),
    );
    expect(new Set(results.map((x) => x.conversationId)).size).toBe(1);
    expect(results[0].conversationId).toBe(dm);
    expect(await prisma.chat2Member.count({ where: { conversationId: dm } })).toBe(2);
  });
  it("concurrent duplicate sends create one message, one event", async () => {
    const key = request();
    const [a, b] = await Promise.all([
      sendMessage(actor, dm, { clientMessageId: key, text: "Одно сообщение" }),
      sendMessage(actor, dm, { clientMessageId: key, text: "Одно сообщение" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.sequence).toBe(b.sequence);
    expect(
      await prisma.chat2Message.count({ where: { conversationId: dm, clientMessageId: key } }),
    ).toBe(1);
    const writer = await prisma.chat2Member.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: dm, userId: actor } },
    });
    expect(writer.lastReadSequence).toBe(BigInt(a.sequence));
    expect(
      await prisma.chat2OutboxEvent.count({
        where: { messageId: a.id, eventType: "message.created" },
      }),
    ).toBe(1);
  });
  it("orders two independent concurrent posts without sequence collision", async () => {
    const [a, b] = await Promise.all([
      sendMessage(actor, dm, { clientMessageId: request(), text: "Один" }),
      sendMessage(other, dm, { clientMessageId: request(), text: "Два" }),
    ]);
    expect(a.sequence).not.toBe(b.sequence);
    const list = await messages(actor, dm);
    expect(list.every((m, i) => i === 0 || BigInt(m.sequence) > BigInt(list[i - 1].sequence))).toBe(
      true,
    );
  });
  it("lets only current staff review private DM complaints without granting access to private history", async () => {
    const sent = await sendMessage(actor, dm, {
      clientMessageId: request(),
      text: "Личный тест модерации",
    });
    const receipt = await reportChatMessage(other, dm, sent.id, {
      reason: "ABUSE",
      comment: "Локальная проверка",
    });
    await expect(listStaffChatReports(other)).rejects.toMatchObject({ status: 403 });
    await expect(resolveStaffChatReport(other, receipt.reportId, "REJECTED")).rejects.toMatchObject(
      { status: 403 },
    );
    await prisma.user.update({ where: { id: stranger }, data: { role: "MODERATOR" } });
    try {
      const pending = await listStaffChatReports(stranger);
      expect(pending.find((r) => r.id === receipt.reportId)).toMatchObject({
        reason: "ABUSE",
        conversation: { kind: "DIRECT" },
      });
      await expect(readGate(stranger, dm)).rejects.toMatchObject({ status: 404 });
      expect(await resolveStaffChatReport(stranger, receipt.reportId, "RESOLVED")).toEqual({
        done: true,
      });
      await expect(
        resolveStaffChatReport(stranger, receipt.reportId, "RESOLVED"),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await prisma.user.update({ where: { id: stranger }, data: { role: "USER" } });
    }
  });
  it("forbids foreign ID probing, sending and reading", async () => {
    await expect(readGate(stranger, dm)).rejects.toMatchObject({ status: 404 });
    await expect(
      sendMessage(stranger, dm, { clientMessageId: request(), text: "Подмена" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(messages(stranger, dm)).rejects.toMatchObject({ status: 404 });
  });
  it("blocks two-way DIRECT reads and writes immediately", async () => {
    await blockUser(actor, other, true);
    await expect(messages(other, dm)).rejects.toMatchObject({ status: 403 });
    await expect(
      sendMessage(actor, dm, { clientMessageId: request(), text: "Запрещено" }),
    ).rejects.toMatchObject({ status: 403 });
    await blockUser(actor, other, false);
    expect((await messages(other, dm)).length).toBeGreaterThan(0);
  });
  it("creates user-owned public group, joins, invites, and restricts outsider", async () => {
    const c = await createGroup(actor, {
      name: "Городской тестовый чат",
      description: "тест",
      kind: "CITY",
      visibility: "PUBLIC",
    });
    group = c.conversationId;
    await expect(messages(other, group)).rejects.toMatchObject({ status: 404 });
    expect(await joinGroup(other, group)).toEqual({ conversationId: group });
    expect(await inviteMember(actor, group, stranger)).toEqual({ conversationId: group });
    const members = await prisma.chat2Member.count({ where: { conversationId: group } });
    expect(members).toBe(3);
    const sender = await sendMessage(other, group, {
      clientMessageId: request(),
      text: "Привет, город",
    });
    expect(sender.sequence).toBe("1");
    expect((await messages(stranger, group))[0].id).toBe(sender.id);
  });
  it("creates idempotent private reports, enforces moderator review and prevents self-report", async () => {
    const post = (await messages(actor, group))[0];
    expect(post.authorId).toBe(other);
    const initial = await reportChatMessage(actor, group, post.id, {
      reason: "SPAM",
      comment: "Изолированный тест",
    });
    const repeat = await reportChatMessage(actor, group, post.id, {
      reason: "ABUSE",
      comment: "Duplicate should not overwrite",
    });
    expect(repeat.reportId).toBe(initial.reportId);
    expect(
      await prisma.chat2Report.count({ where: { messageId: post.id, reporterId: actor } }),
    ).toBe(1);
    await expect(
      reportChatMessage(other, group, post.id, { reason: "SPAM" }),
    ).rejects.toMatchObject({ code: "SELF_REPORT", status: 400 });
    await expect(listChatReports(other, group)).rejects.toMatchObject({ status: 403 });
    const reports = await listChatReports(actor, group);
    expect(reports.find((r) => r.id === initial.reportId)).toMatchObject({
      reason: "SPAM",
      comment: "Изолированный тест",
    });
    await expect(
      resolveChatReport(other, group, initial.reportId, "RESOLVED"),
    ).rejects.toMatchObject({ status: 403 });
    expect(await resolveChatReport(actor, group, initial.reportId, "RESOLVED")).toEqual({
      done: true,
    });
    await expect(
      resolveChatReport(actor, group, initial.reportId, "RESOLVED"),
    ).rejects.toMatchObject({ status: 404 });
    expect((await listChatReports(actor, group)).some((x) => x.id === initial.reportId)).toBe(
      false,
    );
  });
  it("reuses a single global community chat for authorized users", async () => {
    const first = await openCommunity(actor),
      second = await openCommunity(other);
    expect(second.conversationId).toBe(first.conversationId);
    expect((await readGate(other, first.conversationId)).conversation.kind).toBe("COMMUNITY");
    await expect(readGate(stranger, first.conversationId)).rejects.toMatchObject({ status: 404 });
  });
  it("allows real staff to moderate the common room, and denies after role revocation", async () => {
    const common = (await openCommunity(actor)).conversationId;
    const posted = await sendMessage(other, common, {
      clientMessageId: request(),
      text: "Общий чат: тестовая жалоба",
    });
    await reportChatMessage(actor, common, posted.id, { reason: "SPAM" });
    await expect(listChatReports(actor, common)).rejects.toMatchObject({ status: 403 });
    await prisma.user.update({ where: { id: actor }, data: { role: "MODERATOR" } });
    try {
      await openCommunity(actor);
      expect((await readGate(actor, common)).role).toBe("ADMIN");
      const found = await listChatReports(actor, common);
      expect(found.some((r) => r.message.id === posted.id)).toBe(true);
      await prisma.user.update({ where: { id: actor }, data: { role: "USER" } });
      await expect(listChatReports(actor, common)).rejects.toMatchObject({ status: 403 });
      await expect(resolveChatReport(actor, common, found[0].id, "RESOLVED")).rejects.toMatchObject(
        { status: 403 },
      );
    } finally {
      await prisma.user.update({ where: { id: actor }, data: { role: "USER" } });
      await openCommunity(actor);
    }
  });
  it("enforces per-user daily group creation cap", async () => {
    const ids: string[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        const result = await createGroup(stranger, {
          name: `Temporary test group ${i}`,
          kind: "GROUP",
          visibility: "PRIVATE",
        });
        ids.push(result.conversationId);
      }
      await expect(
        createGroup(stranger, { name: "Group above quota", kind: "GROUP", visibility: "PRIVATE" }),
      ).rejects.toMatchObject({ code: "GROUP_CREATION_LIMIT", status: 429 });
    } finally {
      await prisma.chat2Conversation.deleteMany({ where: { id: { in: ids } } });
    }
  });
  it("checks access to private-course chat on every read and send after revocation", async () => {
    const course = await prisma.course.create({
      data: {
        name: "Chat2 isolated course",
        type: `chat2-test-${Date.now()}`,
        trainingLevel: "BEGINNER",
        duration: "3 days",
        logoImg: "/chat2-test.png",
        authorId: actor,
        isPrivate: true,
      },
      select: { id: true },
    });
    courseId = course.id;
    const initial = await openCourse(actor, courseId);
    await expect(openCourse(other, courseId)).rejects.toMatchObject({
      code: "COURSE_ACCESS_REQUIRED",
      status: 403,
    });
    await prisma.courseAccess.create({ data: { courseId, userId: other } });
    expect((await openCourse(other, courseId)).conversationId).toBe(initial.conversationId);
    await sendMessage(other, initial.conversationId, {
      clientMessageId: request(),
      text: "Доступен курс",
    });
    expect((await messages(other, initial.conversationId)).length).toBe(1);
    await prisma.courseAccess.delete({ where: { courseId_userId: { courseId, userId: other } } });
    await expect(readGate(other, initial.conversationId)).rejects.toMatchObject({
      code: "COURSE_ACCESS_REQUIRED",
      status: 403,
    });
    await expect(
      sendMessage(other, initial.conversationId, { clientMessageId: request(), text: "Нет прав" }),
    ).rejects.toMatchObject({ code: "COURSE_ACCESS_REQUIRED", status: 403 });
    expect((await messages(actor, initial.conversationId)).length).toBe(1);
  });
  it("group moderation forbids ordinary members, bans persist across join and invite", async () => {
    await expect(moderateGroup(other, group, stranger, "BAN")).rejects.toMatchObject({
      status: 403,
    });
    expect(await moderateGroup(actor, group, stranger, "BAN")).toMatchObject({ done: true });
    await expect(readGate(stranger, group)).rejects.toMatchObject({ status: 404 });
    await expect(joinGroup(stranger, group)).rejects.toMatchObject({ code: "BANNED", status: 403 });
    await expect(inviteMember(actor, group, stranger)).rejects.toMatchObject({
      code: "BANNED",
      status: 403,
    });
    await expect(moderateGroup(other, group, actor, "BAN")).rejects.toMatchObject({ status: 403 });
    expect(await moderateGroup(actor, group, stranger, "UNBAN")).toMatchObject({ done: true });
    expect(await joinGroup(stranger, group)).toMatchObject({ conversationId: group });
  });
  it("owner can update visibility, promote moderator and transfer ownership", async () => {
    expect((await updateGroup(actor, group, { visibility: "PRIVATE" })).visibility).toBe("PRIVATE");
    await expect(updateGroup(other, group, { name: "Подмена" })).rejects.toMatchObject({
      status: 403,
    });
    await moderateGroup(actor, group, other, "PROMOTE");
    await expect(moderateGroup(other, group, actor, "KICK")).rejects.toMatchObject({ status: 403 });
    expect(await transferGroupOwner(actor, group, other)).toMatchObject({ ownerId: other });
    await expect(moderateGroup(actor, group, other, "BAN")).rejects.toMatchObject({ status: 403 });
    expect((await readGate(other, group)).role).toBe("OWNER");
  });
  it("member leaves group without deleting owner or group history", async () => {
    expect(await leaveChat(actor, group)).toEqual({ left: true });
    await expect(messages(actor, group)).rejects.toMatchObject({ status: 404 });
    expect((await messages(other, group)).length).toBe(1);
    await expect(leaveChat(other, group)).rejects.toMatchObject({
      code: "OWNER_CANNOT_LEAVE",
      status: 409,
    });
  });
  it("marks read monotonically; read cursors never exceed current sequence", async () => {
    const last = await prisma.chat2Conversation.findUniqueOrThrow({
      where: { id: dm },
      select: { nextSequence: true },
    });
    const read = await markRead(actor, dm, last.nextSequence + 100n);
    expect(read.lastReadSequence).toBe(last.nextSequence.toString());
    const again = await markRead(actor, dm, 0n);
    expect(again.lastReadSequence).toBe("0");
    const member = await prisma.chat2Member.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: dm, userId: actor } },
    });
    expect(member.lastReadSequence).toBe(last.nextSequence);
  });
});
