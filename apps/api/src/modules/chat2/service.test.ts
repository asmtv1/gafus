import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => {
  const fn = () => vi.fn();
  const chat2Member = {
    findUnique: fn(), findFirst: fn(), findMany: fn(), updateMany: fn(), update: fn(), upsert: fn(), delete: fn(), deleteMany: fn(),
  };
  const chat2Block = { findFirst: fn() };
  const chat2Message = { findUnique: fn(), findFirst: fn(), findMany: fn(), create: fn(), findUniqueOrThrow: fn() };
  const chat2MessageReaction = { findMany: fn(), findUnique: fn(), upsert: fn(), delete: fn() };
  const chat2Media = { findMany: fn(), findFirst: fn(), updateMany: fn() };
  const chat2Conversation = {
    upsert: fn(), update: fn(), findUnique: fn(), findMany: fn(), count: fn(), create: fn(),
  };
  const chat2OutboxEvent = { create: fn() };
  return {
    chat2Member,
    chat2Block,
    chat2Message,
    chat2MessageReaction,
    chat2Media,
    chat2Conversation,
    chat2OutboxEvent,
    user: { findUnique: fn(), findFirst: fn() },
    entitlement: fn(),
    courseAccess: fn(),
    mediaUrl: fn(),
    avatarSignedUrl: fn(),
  };
});
vi.mock("@gafus/prisma", () => ({
  prisma: {
    chat2Member: mock.chat2Member,
    chat2Block: mock.chat2Block,
    chat2Message: mock.chat2Message,
    chat2MessageReaction: mock.chat2MessageReaction,
    chat2Conversation: mock.chat2Conversation,
    chat2Media: mock.chat2Media,
    chat2OutboxEvent: mock.chat2OutboxEvent,
    user: mock.user,
    $transaction: async (f: (tx: unknown) => Promise<unknown>) =>
      f({
        chat2Member: mock.chat2Member,
        chat2Message: mock.chat2Message,
    chat2MessageReaction: mock.chat2MessageReaction,
        chat2Conversation: mock.chat2Conversation,
        chat2Media: mock.chat2Media,
        chat2OutboxEvent: mock.chat2OutboxEvent,
      }),
  },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "P2034";
    },
  },
}));
vi.mock("./revocation.js", () => ({ revokeLiveRoomSubscription: vi.fn() }));
vi.mock("@gafus/core/services/course", () => ({ checkCourseAccessById: mock.courseAccess }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getCynologistEntitlements: mock.entitlement,
}));
vi.mock("@gafus/cdn-upload", () => ({
  chat2ReservePrivateObjectKey: vi.fn(),
  chat2UploadPrivateImageOrPdf: vi.fn(),
  chat2SignedPrivateMedia: mock.mediaUrl,
  chat2DeletePrivateMedia: vi.fn(),
  getSignedDownloadUrl: mock.avatarSignedUrl,
}));
import {
  dto, readGate, writeGate, openDirect, openCynologist, sendMessage, getAttachment,
  inviteMember, leaveChat, openCommunity, toggleMessageReaction, messages,
  chat2MemberAvatarUrl, listChats, chatDetails, createGroup, discover, joinGroup,
} from "./service";
const room = (kind = "DIRECT", owner = "actor") => ({
  id: "room",
  kind,
  createdById: owner,
  nextSequence: 4n,
});
const member = (kind = "DIRECT", owner = "actor") => ({
  id: "membership",
  conversationId: "room",
  userId: "actor",
  role: "MEMBER",
  conversation: room(kind, owner),
});
const message = {
  id: "message",
  conversationId: "room",
  sequence: 5n,
  authorId: "actor",
  clientMessageId: "c123",
  text: "Привет",
  replyToId: null,
  createdAt: new Date("2026-10-26T10:00:00Z"),
  editedAt: null,
  deletedAt: null,
  attachments: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.chat2Block.findFirst.mockResolvedValue(null);
  mock.user.findFirst.mockResolvedValue(null);
  mock.chat2Member.findUnique.mockResolvedValue(member());
  mock.chat2Member.findFirst.mockResolvedValue({ userId: "other" });
  mock.entitlement.mockResolvedValue({ canUseCynologistChat: true });
  mock.courseAccess.mockResolvedValue({ hasAccess: true });
});
describe("Default common chat membership", () => {
  const community = {
    id: "community-default", kind: "COMMUNITY", scopeKey: "global",
    name: "Общий чат GAFUS", description: null, visibility: "PUBLIC",
    nextSequence: 0n, avatarMediaId: null, messages: [],
    members: [{ userId: "actor", role: "MEMBER", user: {
      username: "actor", profile: { avatarUrl: null },
    } }],
  };
  const inboxRecord = {
    id: "default-membership", conversationId: community.id, userId: "actor",
    role: "MEMBER", lastReadSequence: 0n, mutedUntil: null,
    hiddenAt: null, conversation: community,
  };
  beforeEach(() => {
    mock.chat2Conversation.upsert.mockResolvedValue({ id: community.id, nextSequence: 6n });
    mock.chat2Member.findUnique.mockResolvedValue(null);
    mock.chat2Member.upsert.mockResolvedValue(inboxRecord);
    mock.user.findUnique.mockResolvedValue({ role: "USER" });
    mock.chat2Member.findMany.mockResolvedValue([inboxRecord]);
  });

  it("automatically joins an existing or new user on their first inbox load", async () => {
    const rows = await listChats("actor");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: community.id, kind: "COMMUNITY", name: "Общий чат GAFUS" });
    expect(mock.chat2Conversation.upsert).toHaveBeenCalledWith({
      where: { kind_scopeKey: { kind: "COMMUNITY", scopeKey: "global" } },
      update: {},
      create: { kind: "COMMUNITY", scopeKey: "global", visibility: "PUBLIC", name: "Общий чат GAFUS" },
    });
    expect(mock.chat2Member.upsert).toHaveBeenCalledWith({
      where: { conversationId_userId: { conversationId: community.id, userId: "actor" } },
      update: {},
      create: { conversationId: community.id, userId: "actor", role: "MEMBER", lastReadSequence: 6n },
    });
  });

  it("reads the canonical singleton without an UPSERT on repeated polls", async () => {
    mock.chat2Conversation.findUnique.mockResolvedValue({ id: community.id, nextSequence: 6n });
    mock.chat2Member.findUnique.mockResolvedValue(inboxRecord);
    await listChats("actor");
    await listChats("actor");
    expect(mock.chat2Conversation.upsert).not.toHaveBeenCalled();
  });

  it("does not rewrite existing membership on each inbox refresh", async () => {
    mock.chat2Member.findUnique.mockResolvedValue(inboxRecord);
    await listChats("actor");
    await listChats("actor");
    expect(mock.chat2Member.upsert).not.toHaveBeenCalled();
    expect(mock.chat2Member.update).not.toHaveBeenCalled();
  });

  it("uses moderator privileges for staff in the common room", async () => {
    mock.user.findUnique.mockResolvedValue({ role: "MODERATOR" });
    await listChats("actor");
    expect(mock.chat2Member.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { conversationId: community.id, userId: "actor", role: "ADMIN", lastReadSequence: 6n },
    }));
  });

  it("never re-adds a banned or explicitly departed participant", async () => {
    for (const existing of [
      { ...inboxRecord, role: "BANNED" },
      { ...inboxRecord, hiddenAt: new Date() },
    ]) {
      vi.clearAllMocks();
      mock.chat2Conversation.upsert.mockResolvedValue({ id: community.id, nextSequence: 6n });
      mock.chat2Member.findUnique.mockResolvedValue(existing);
      mock.chat2Member.findMany.mockResolvedValue([]);
      const rows = await listChats("actor");
      expect(rows).toEqual([]);
      expect(mock.chat2Member.upsert).not.toHaveBeenCalled();
      expect(mock.chat2Member.update).not.toHaveBeenCalled();
    }
  });

  it("persists opt-out on leave and allows explicit rejoin", async () => {
    mock.chat2Member.findUnique.mockResolvedValue(inboxRecord);
    await leaveChat("actor", community.id);
    expect(mock.chat2Member.delete).not.toHaveBeenCalled();
    expect(mock.chat2Member.update).toHaveBeenCalledWith({
      where: { id: "default-membership" },
      data: { hiddenAt: expect.any(Date) },
    });
    mock.chat2Member.findUnique.mockResolvedValue({ ...inboxRecord, hiddenAt: new Date() });
    mock.chat2Member.findMany.mockResolvedValue([]);
    expect(await listChats("actor")).toEqual([]);
    expect(mock.chat2Member.upsert).not.toHaveBeenCalled();
    expect(await openCommunity("actor")).toEqual({ conversationId: community.id });
    expect(mock.chat2Member.update).toHaveBeenCalledWith({
      where: { id: "default-membership" },
      data: { role: "MEMBER", hiddenAt: null },
    });
  });

  it("offers the community through discovery for a user who opted out", async () => {
    mock.chat2Conversation.findMany.mockResolvedValue([{
      id: community.id,
      kind: "COMMUNITY",
      name: community.name,
      description: null,
      avatarMediaId: null,
      _count: { members: 2 },
      members: [],
    }]);
    const found = await discover("actor", "Общий");
    expect(found[0]).toMatchObject({
      id: community.id, kind: "COMMUNITY", joined: false,
      memberCount: 2, avatarUrl: null,
    });
    expect(mock.chat2Conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        kind: { in: expect.arrayContaining(["COMMUNITY"]) },
      }),
    }));
    mock.chat2Conversation.findUnique.mockResolvedValue({
      id: community.id, kind: "COMMUNITY", visibility: "PUBLIC",
    });
    mock.chat2Member.findUnique.mockResolvedValue({ ...inboxRecord, hiddenAt: new Date() });
    expect(await joinGroup("actor", community.id)).toEqual({ conversationId: community.id });
    expect(mock.chat2Member.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { hiddenAt: null },
    }));
  });

  it("preserves common-room visibility in a full 100-conversation inbox", async () => {
    const other = Array.from({ length: 100 }, (_, i) => ({
      ...inboxRecord,
      conversationId: "other-" + i,
      conversation: { ...community, id: "other-" + i, kind: "GROUP", name: "Group " + i },
    }));
    mock.chat2Member.findUnique.mockImplementation(async () => inboxRecord);
    mock.chat2Member.findMany.mockResolvedValue(other);
    const rows = await listChats("actor");
    expect(rows).toHaveLength(100);
    expect(rows[0].id).toBe(community.id);
    expect(rows.filter((entry) => entry.kind === "COMMUNITY")).toHaveLength(1);
  });
});

describe("Chat2 user-owned Course topic vs protected system COURSE", () => {
  it("creates a COURSE_TOPIC group without course access and includes it in discovery", async () => {
    mock.chat2Conversation.count.mockResolvedValue(0);
    mock.chat2Conversation.create.mockResolvedValue({ id: "topic-room" });
    expect(await createGroup("actor", {
      name: "Школа собак", description: "Обсуждаем упражнения",
      visibility: "PUBLIC", kind: "COURSE_TOPIC",
    })).toEqual({ conversationId: "topic-room" });
    expect(mock.chat2Conversation.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      createdById: "actor", kind: { in: expect.arrayContaining(["COURSE_TOPIC"]) },
    }) });
    expect(mock.chat2Conversation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      kind: "COURSE_TOPIC", visibility: "PUBLIC", createdById: "actor",
      members: { create: { userId: "actor", role: "OWNER" } },
    }) });
    mock.chat2Conversation.findMany.mockResolvedValue([{
      id: "topic-room", name: "Школа собак", kind: "COURSE_TOPIC", description: "Обсуждаем упражнения",
      _count: { members: 1 }, members: [],
    }]);
    const found = await discover("reader");
    expect(found[0]).toMatchObject({ kind: "COURSE_TOPIC", joined: false, memberCount: 1 });
    expect(mock.chat2Conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ kind: { in: expect.arrayContaining(["COURSE_TOPIC"]) } }),
    }));
    mock.chat2Conversation.findUnique.mockResolvedValue({
      id: "topic-room", kind: "COURSE_TOPIC", visibility: "PUBLIC",
    });
    mock.chat2Member.findUnique.mockResolvedValue(null);
    expect(await joinGroup("reader", "topic-room")).toEqual({ conversationId: "topic-room" });
    expect(mock.chat2Member.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { conversationId: "topic-room", userId: "reader" },
    }));
  });

  it("keeps system COURSE rooms ineligible for public community join", async () => {
    mock.chat2Conversation.findUnique.mockResolvedValue({
      id: "system-course-room", kind: "COURSE", visibility: "PUBLIC",
    });
    await expect(joinGroup("reader", "system-course-room")).rejects.toMatchObject({
      code: "FORBIDDEN", status: 403,
    });
    expect(mock.chat2Member.upsert).not.toHaveBeenCalled();
  });
});

describe("Chat2 actor authorization and idempotency", () => {
  it("never leaks a foreign chat by guessing an ID", async () => {
    mock.chat2Member.findUnique.mockResolvedValueOnce(null);
    await expect(readGate("actor", "foreign")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
  it("blocks realtime subscription and read access after DIRECT block", async () => {
    mock.chat2Block.findFirst.mockResolvedValueOnce({ blockerId: "other", blockedId: "actor" });
    await expect(readGate("actor", "room")).rejects.toMatchObject({ code: "BLOCKED", status: 403 });
  });
  it("does not allow another trainer into assigned cynologist chat", async () => {
    mock.chat2Member.findUnique.mockResolvedValueOnce(member("CYNOLOGIST", "client"));
    mock.user.findUnique.mockResolvedValue({ role: "TRAINER" });
    const previous = process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID;
    process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID = "trainer-1";
    try {
      await expect(readGate("actor", "room")).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    } finally {
      if (previous === undefined) delete process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID;
      else process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID = previous;
    }
  });
  it("prevents starting a personal conversation with yourself", async () => {
    await expect(openDirect("actor", "actor")).rejects.toMatchObject({ code: "SELF", status: 400 });
    expect(mock.chat2Conversation.upsert).not.toHaveBeenCalled();
  });
  it("creates DIRECT with sorted canonical key and both members", async () => {
    mock.user.findUnique.mockResolvedValue({ accountDeletionRequestedAt: null });
    mock.chat2Conversation.upsert.mockResolvedValue({ id: "room" });
    expect(await openDirect("z-user", "a-user")).toEqual({ conversationId: "room" });
    expect(mock.chat2Conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { directKey: "dm:a-user:z-user" },
      }),
    );
  });
  it("blocks new DIRECT messages to lana by ID or from lana before room creation", async () => {
    mock.user.findUnique.mockResolvedValue({ accountDeletionRequestedAt: null });
    mock.user.findFirst.mockResolvedValue({ id: "lana-id" });
    for (const [sender, target] of [["actor", "lana-id"], ["lana-id", "actor"]]) {
      await expect(openDirect(sender, target)).rejects.toMatchObject({
        code: "CYNOLOGIST_DIRECT_FORBIDDEN", status: 403,
      });
    }
    expect(mock.chat2Conversation.upsert).not.toHaveBeenCalled();
  });
  it("blocks sending into an existing private room with lana", async () => {
    mock.user.findFirst.mockResolvedValue({ id: "lana-id" });
    await expect(sendMessage("actor", "room", { clientMessageId: "lana-test", text: "Обход" }))
      .rejects.toMatchObject({ code: "CYNOLOGIST_DIRECT_FORBIDDEN", status: 403 });
    expect(mock.chat2Message.create).not.toHaveBeenCalled();
  });
  it("always assigns lana to the paid channel and keeps its canonical room", async () => {
    mock.user.findFirst.mockResolvedValue({ id: "lana-id" });
    mock.chat2Conversation.upsert.mockResolvedValue({ id: "cyno-room" });
    mock.chat2Member.findMany.mockResolvedValue([{ userId: "client" }, { userId: "lana-id" }]);
    expect(await openCynologist("client")).toEqual({ conversationId: "cyno-room" });
    expect(mock.chat2Conversation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        kind: "CYNOLOGIST", directKey: "cyno:client",
        members: { create: [{ userId: "client" }, { userId: "lana-id" }] },
      }),
    }));
    expect(mock.chat2Member.deleteMany).not.toHaveBeenCalled();
  });
  it("repairs a legacy paid room with the wrong trainer without removing messages", async () => {
    mock.user.findFirst.mockResolvedValue({ id: "lana-id" });
    mock.chat2Conversation.upsert.mockResolvedValue({ id: "cyno-room" });
    mock.chat2Member.findMany.mockResolvedValue([{ userId: "client" }, { userId: "trainer-old" }]);
    // The displaced user loses their membership, not the room or its history.
    expect(await openCynologist("client")).toEqual({ conversationId: "cyno-room" });
    expect(mock.chat2Member.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId_userId: { conversationId: "cyno-room", userId: "lana-id" } },
    }));
    expect(mock.chat2Member.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: "cyno-room", userId: { notIn: ["client", "lana-id"] } },
    });
    expect(mock.chat2Conversation.update).not.toHaveBeenCalled();
    expect(mock.chat2Message.create).not.toHaveBeenCalled();
  });
  it("rejects unsubscribed writes to the specialist even in an existing room", async () => {
    mock.chat2Member.findUnique.mockResolvedValueOnce(member("CYNOLOGIST", "actor"));
    mock.entitlement.mockResolvedValue({ canUseCynologistChat: false });
    await expect(writeGate("actor", "room")).rejects.toMatchObject({
      code: "SUBSCRIPTION_REQUIRED", status: 403,
    });
    expect(mock.chat2Member.deleteMany).not.toHaveBeenCalled();
  });
  it("repairs specialist membership before posting into an existing stale room", async () => {
    mock.chat2Member.findUnique.mockResolvedValueOnce(member("CYNOLOGIST", "actor"));
    mock.user.findFirst.mockResolvedValue({ id: "lana-id" });
    mock.chat2Member.findMany.mockResolvedValue([{ userId: "actor" }, { userId: "trainer-old" }]);
    await writeGate("actor", "room");
    expect(mock.chat2Member.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: "room", userId: { notIn: ["actor", "lana-id"] } },
    });
  });
  it("does not permit inviting lana into private or public group chats", async () => {
    mock.chat2Member.findUnique.mockResolvedValueOnce({ ...member("GROUP"), role: "OWNER" });
    mock.user.findUnique.mockResolvedValue({ id: "lana-id", username: "LaNa" });
    await expect(inviteMember("actor", "room", "lana-id")).rejects.toMatchObject({
      code: "CYNOLOGIST_DIRECT_FORBIDDEN", status: 403,
    });
    expect(mock.chat2Member.upsert).not.toHaveBeenCalled();
  });
  it("returns previously committed message without writing an outbox duplicate", async () => {
    mock.chat2Message.findUnique.mockResolvedValue(message);
    expect(
      await sendMessage("actor", "room", { clientMessageId: "c123", text: "Привет" }),
    ).toMatchObject({ id: "message", sequence: "5" });
    expect(mock.chat2Conversation.update).not.toHaveBeenCalled();
    expect(mock.chat2OutboxEvent.create).not.toHaveBeenCalled();
  });
  it("rejects reusing a clientMessageId with changed contents", async () => {
    mock.chat2Message.findUnique.mockResolvedValue(message);
    await expect(
      sendMessage("actor", "room", { clientMessageId: "c123", text: "Подмена" }),
    ).rejects.toMatchObject({ code: "MESSAGE_ID_CONFLICT", status: 409 });
  });
  it("rejects a forged reply to a different chat", async () => {
    mock.chat2Message.findUnique.mockResolvedValue(null);
    mock.chat2Message.findFirst.mockResolvedValue(null);
    await expect(
      sendMessage("actor", "room", {
        clientMessageId: "c124",
        text: "Ответ",
        replyToId: "foreign",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REPLY", status: 400 });
    expect(mock.chat2Message.create).not.toHaveBeenCalled();
  });
  it("rejects a wrong-room attachment before increasing message sequence", async () => {
    mock.chat2Message.findUnique.mockResolvedValue(null);
    mock.chat2Media.findMany.mockResolvedValue([]);
    await expect(
      sendMessage("actor", "room", {
        clientMessageId: "c125",
        text: "",
        attachmentIds: ["foreign"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ATTACHMENTS", status: 400 });
    expect(mock.chat2Conversation.update).not.toHaveBeenCalled();
  });
  it("only grants signed media when attached to visible authorized message", async () => {
    mock.chat2Media.findFirst.mockResolvedValue({
      id: "file",
      message: { deletedAt: new Date() },
      status: "READY",
      mime: "image/jpeg",
      name: "photo.jpg",
      objectKey: "key",
    });
    await expect(getAttachment("actor", "room", "file")).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_FOUND",
      status: 404,
    });
    expect(mock.mediaUrl).not.toHaveBeenCalled();
  });
  it("serializes BigInt as a JSON-safe sequence", () => {
    expect(dto(message)).toMatchObject({ sequence: "5", text: "Привет", attachments: [] });
  });
});

describe("Chat2 user avatars in actor-scoped conversation DTOs", () => {
  const participants = [
    { userId: "actor", role: "MEMBER", user: {
      username: "actor", profile: { avatarUrl: null },
    } },
    { userId: "target", role: "MEMBER", user: {
      username: "target", profile: { avatarUrl: "isodev-avatar:documents/uploads/users/target/avatar/photo.png" },
    } },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    mock.chat2Conversation.findUnique.mockResolvedValue({ id: "community-default", nextSequence: 0n });
    mock.chat2Block.findFirst.mockResolvedValue(null);
    mock.chat2Member.findUnique.mockResolvedValue(member());
    mock.avatarSignedUrl.mockResolvedValue(
      "http://127.0.0.1:9000/gafus-refactor-documents-test/target.jpg?X-Amz-Signature=test",
    );
  });

  it("signs a private avatar on read without returning its opaque object key", async () => {
    const avatarKey = "isodev-avatar:documents/uploads/users/test-avatar-1.jpg";
    const avatar = await chat2MemberAvatarUrl(avatarKey);
    expect(avatar).toContain("X-Amz-Signature=test");
    expect(avatar).not.toContain("isodev-avatar:");
    expect(mock.avatarSignedUrl).toHaveBeenCalledWith(avatarKey, 600);
    expect(await chat2MemberAvatarUrl(avatarKey)).toBe(avatar);
    expect(mock.avatarSignedUrl).toHaveBeenCalledOnce();
  });

  it("rejects unsafe schemes and falls back if signing fails", async () => {
    for (const input of ["javascript:alert(1)", "//cdn.example/a.png",
      "https://user:pass@example.com/a.png", "isodev-avatar:"]) {
      if (input === "isodev-avatar:") mock.avatarSignedUrl.mockRejectedValueOnce(new Error("unavailable"));
      expect(await chat2MemberAvatarUrl(input)).toBeNull();
    }
  });

  it("repairs an inbox specialist room with stale trainer before exposing participants", async () => {
    const oldRoom = {
      role: "MEMBER", mutedUntil: null, lastReadSequence: 0n,
      conversation: {
        ...room("CYNOLOGIST", "actor"), name: null, description: null,
        visibility: "PRIVATE", messages: [], avatarMediaId: null,
        members: [participants[0], { ...participants[1], userId: "trainer-old", user: {
          username: "trainer", profile: { avatarUrl: null },
        } }],
      },
    };
    const correctedRoom = {
      ...oldRoom,
      conversation: { ...oldRoom.conversation, members: [participants[0], {
        userId: "lana-id", role: "MEMBER", user: {
          username: "lana", profile: { avatarUrl: null },
        },
      }] },
    };
    mock.user.findFirst.mockResolvedValue({ id: "lana-id" });
    mock.chat2Member.findMany
      .mockResolvedValueOnce([oldRoom])
      .mockResolvedValueOnce([{ userId: "actor" }, { userId: "trainer-old" }])
      .mockResolvedValueOnce([correctedRoom]);
    const list = await listChats("actor");
    expect(list).toHaveLength(1);
    expect(list[0].members.map((x) => x.username)).toEqual(["actor", "lana"]);
    expect(mock.chat2Member.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: "room", userId: { notIn: ["actor", "lana-id"] } },
    });
  });
  it("includes signed participant avatar in DIRECT list while preserving participant IDs", async () => {
    mock.chat2Member.findMany.mockResolvedValue([{
      role: "MEMBER", mutedUntil: null, lastReadSequence: 0n,
      conversation: {
        ...room(), name: null, description: null, visibility: "PRIVATE",
        messages: [], members: participants,
      },
    }]);
    const conversations = await listChats("actor");
    expect(conversations).toHaveLength(1);
    expect(conversations[0].members).toEqual([
      { userId: "actor", username: "actor", role: "MEMBER", avatarUrl: null },
      { userId: "target", username: "target", role: "MEMBER",
        avatarUrl: expect.stringContaining("X-Amz-Signature=test") },
    ]);
    expect(mock.avatarSignedUrl).toHaveBeenCalledOnce();
  });

  it("includes the same participant avatar in conversation details", async () => {
    mock.chat2Member.findMany.mockResolvedValue(participants);
    const details = await chatDetails("actor", "room");
    expect(details.members[1]).toMatchObject({
      userId: "target", username: "target",
      avatarUrl: expect.stringContaining("X-Amz-Signature=test"),
    });
  });

  it("returns safe profile photos to members of a group, without exposing object keys", async () => {
    mock.chat2Member.findUnique.mockResolvedValue(member("GROUP"));
    mock.chat2Member.findMany.mockResolvedValue([
      participants[0],
      { ...participants[1], user: { ...participants[1].user, profile: {
        avatarUrl: "isodev-avatar:documents/uploads/users/group-detail/avatar.png",
      } } },
    ]);
    const details = await chatDetails("actor", "room");
    expect(details.members[0].avatarUrl).toBeNull();
    expect(details.members[1].avatarUrl).toContain("X-Amz-Signature=test");
    expect(details.members[1].avatarUrl).not.toContain("isodev-avatar:");
    expect(mock.avatarSignedUrl).toHaveBeenCalledOnce();
  });

  it("includes profile photos in a group inbox for message authors", async () => {
    mock.chat2Member.findMany.mockResolvedValue([{
      role: "MEMBER", mutedUntil: null, lastReadSequence: 0n,
      conversation: {
        ...room("COMMUNITY"), name: "Общий чат GAFUS",
        description: null, visibility: "PUBLIC",
        messages: [], members: [
          participants[0],
          { ...participants[1], user: { ...participants[1].user, profile: {
            avatarUrl: "isodev-avatar:documents/uploads/users/group-list/avatar.png",
          } } },
        ],
      },
    }]);
    const list = await listChats("actor");
    expect(list[0].members[0].avatarUrl).toBeNull();
    expect(list[0].members[1].avatarUrl).toContain("X-Amz-Signature=test");
    expect(list[0].members[1].avatarUrl).not.toContain("isodev-avatar:");
    expect(mock.avatarSignedUrl).toHaveBeenCalledOnce();
  });
});


describe("Chat2 message reactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.chat2Member.findUnique.mockResolvedValue(member());
    mock.chat2Member.findFirst.mockResolvedValue({ userId: "other" });
    mock.chat2Block.findFirst.mockResolvedValue(null);
    mock.user.findFirst.mockResolvedValue(null);
    mock.courseAccess.mockResolvedValue({ hasAccess: true });
    mock.chat2Message.findFirst.mockResolvedValue({ id: "message" });
    mock.chat2MessageReaction.findUnique.mockResolvedValue(null);
    mock.chat2MessageReaction.findMany.mockResolvedValue([]);
    mock.chat2OutboxEvent.create.mockResolvedValue({ id: "event" });
  });
  it("adds and broadcasts a reaction on the authorized room message", async () => {
    expect(await toggleMessageReaction("actor", "room", "message", "👍"))
      .toEqual({ messageId: "message", emoji: "👍", active: true });
    expect(mock.chat2Message.findFirst).toHaveBeenCalledWith({
      where: { id: "message", conversationId: "room", deletedAt: null },
      select: { id: true },
    });
    expect(mock.chat2MessageReaction.upsert).toHaveBeenCalledWith({
      where: { messageId_userId: { messageId: "message", userId: "actor" } },
      update: { emoji: "👍" },
      create: { messageId: "message", userId: "actor", emoji: "👍" },
    });
    expect(mock.chat2OutboxEvent.create).toHaveBeenCalledWith({
      data: { conversationId: "room", messageId: "message", eventType: "message.reacted" },
    });
  });
  it("toggles off the same emoji and replaces a different emoji", async () => {
    mock.chat2MessageReaction.findUnique.mockResolvedValue({ emoji: "👍" });
    expect(await toggleMessageReaction("actor", "room", "message", "👍"))
      .toMatchObject({ active: false });
    expect(mock.chat2MessageReaction.delete).toHaveBeenCalledOnce();
    mock.chat2MessageReaction.findUnique.mockResolvedValue({ emoji: "😂" });
    expect(await toggleMessageReaction("actor", "room", "message", "❤️"))
      .toMatchObject({ active: true });
    expect(mock.chat2MessageReaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { emoji: "❤️" },
    }));
  });
  it("rejects unsupported emoji and deleted or other-room messages", async () => {
    await expect(toggleMessageReaction("actor", "room", "message", "⚠️"))
      .rejects.toMatchObject({ status: 400, code: "INVALID_REACTION" });
    mock.chat2Message.findFirst.mockResolvedValue(null);
    await expect(toggleMessageReaction("actor", "room", "message", "👏"))
      .rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mock.chat2MessageReaction.upsert).not.toHaveBeenCalled();
  });
  it("groups current page reactions into counts and current-user flags", async () => {
    mock.chat2Message.findMany.mockResolvedValue([{ ...message, attachments: [] }]);
    mock.chat2MessageReaction.findMany.mockResolvedValue([
      { messageId: "message", userId: "actor", emoji: "👍" },
      { messageId: "message", userId: "peer", emoji: "👍" },
      { messageId: "message", userId: "peer2", emoji: "😂" },
    ]);
    const result = await messages("actor", "room");
    expect(result[0].reactions).toEqual([
      { emoji: "👍", count: 2, mine: true },
      { emoji: "😂", count: 1, mine: false },
    ]);
  });
});
