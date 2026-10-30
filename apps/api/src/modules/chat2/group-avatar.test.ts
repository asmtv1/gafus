import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    member: { findUnique: fn() },
    conversation: { update: fn(), findUniqueOrThrow: fn() },
    media: { create: fn(), deleteMany: fn(), findFirst: fn() },
    deletion: { create: fn(), updateMany: fn(), deleteMany: fn() },
    locked: fn(),
    reserve: fn(), upload: fn(), signed: fn(),
  };
});
vi.mock("@gafus/prisma", () => ({
  prisma: {
    chat2Member: mock.member,
    chat2Conversation: mock.conversation,
    chat2Media: mock.media,
    chat2MediaDeletionIntent: mock.deletion,
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      chat2Member: mock.member,
      chat2Conversation: mock.conversation,
      chat2Media: mock.media,
      $queryRaw: mock.locked,
    }),
  },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("@gafus/core/services/appSubscription", () => ({ getCynologistEntitlements: vi.fn() }));
vi.mock("@gafus/core/services/course", () => ({ checkCourseAccessById: vi.fn() }));
vi.mock("@gafus/cdn-upload", () => ({
  chat2ReservePrivateObjectKey: mock.reserve,
  chat2UploadPrivateImageOrPdf: mock.upload,
  chat2SignedPrivateMedia: mock.signed,
  getSignedDownloadUrl: vi.fn(),
  chat2DeletePrivateMedia: vi.fn(),
}));
import { changeGroupAvatar, removeGroupAvatar, chatDetails } from "./service";

const jpeg = { name: "dog.jpg", type: "image/jpeg", bytes: Uint8Array.from([255, 216, 255, ...Array(20).fill(1)]) };
const membership = (kind = "GROUP", role = "OWNER") => ({
  conversationId: "group1", userId: "alice", role,
  conversation: { id: "group1", kind, avatarMediaId: "old-avatar", nextSequence: 0n },
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.deletion.create.mockResolvedValue({});
  mock.deletion.deleteMany.mockResolvedValue({ count: 1 });
  mock.deletion.updateMany.mockResolvedValue({ count: 1 });
  mock.media.deleteMany.mockResolvedValue({ count: 1 });
  mock.conversation.update.mockResolvedValue({});
  mock.member.findUnique.mockResolvedValue(membership());
  mock.locked.mockResolvedValue([{ avatarMediaId: "old-avatar" }]);
  mock.reserve.mockReturnValue("chat2/group1/alice/random.jpg");
  mock.upload.mockResolvedValue({ objectKey: "chat2/group1/alice/random.jpg", kind: "image", mime: "image/jpeg", bytes: jpeg.bytes.length });
  mock.media.create.mockResolvedValue({ id: "new-avatar" });
  mock.conversation.findUniqueOrThrow.mockResolvedValue({ avatarMediaId: "new-avatar" });
  mock.media.findFirst.mockResolvedValue({ objectKey: "chat2/group1/alice/random.jpg" });
  mock.signed.mockResolvedValue("https://assets.example.test/signed.jpg");
});
describe("Chat2 group avatar permissions, replacement, cleanup", () => {
  it("rejects members and system rooms before touching storage", async () => {
    mock.member.findUnique.mockResolvedValue(membership("GROUP", "MEMBER"));
    await expect(changeGroupAvatar("alice", "group1", jpeg)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    mock.member.findUnique.mockResolvedValue(membership("COURSE", "OWNER"));
    await expect(removeGroupAvatar("alice", "group1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(mock.reserve).not.toHaveBeenCalled();
    expect(mock.deletion.create).not.toHaveBeenCalled();
  });
  it("does not create an upload reservation for nonimage or oversized uploads", async () => {
    await expect(changeGroupAvatar("alice", "group1", { ...jpeg, type: "application/pdf" }))
      .rejects.toMatchObject({ code: "INVALID_AVATAR" });
    await expect(changeGroupAvatar("alice", "group1", { ...jpeg, bytes: new Uint8Array(5 * 1024 * 1024 + 1) }))
      .rejects.toMatchObject({ code: "INVALID_AVATAR" });
    expect(mock.deletion.create).not.toHaveBeenCalled();
  });
  it("reserves before upload, locks the room, commits replacement and removes obsolete media", async () => {
    await expect(changeGroupAvatar("alice", "group1", jpeg))
      .resolves.toEqual({ avatarUrl: "https://assets.example.test/signed.jpg" });
    expect(mock.deletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "RESERVED" }) });
    expect(mock.upload).toHaveBeenCalledWith("group1", "alice", jpeg.bytes, "image/jpeg", expect.any(String));
    expect(mock.locked).toHaveBeenCalledTimes(1);
    expect(mock.media.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "AVATAR", conversationId: "group1" }) });
    expect(mock.conversation.update).toHaveBeenCalledWith({ where: { id: "group1" }, data: { avatarMediaId: "new-avatar" } });
    expect(mock.media.deleteMany).toHaveBeenCalledWith({ where: { id: "old-avatar", conversationId: "group1", status: "AVATAR", messageId: null } });
    expect(mock.deletion.deleteMany).toHaveBeenCalledWith({ where: { objectKey: expect.any(String), status: "RESERVED" } });
  });
  it("keeps durable cleanup reservation if S3 succeeds but DB fails", async () => {
    mock.media.create.mockRejectedValue(new Error("db unavailable"));
    await expect(changeGroupAvatar("alice", "group1", jpeg)).rejects.toThrow("db unavailable");
    expect(mock.deletion.updateMany).toHaveBeenCalledWith({
      where: { objectKey: expect.any(String), status: "RESERVED" },
      data: expect.objectContaining({ status: "PENDING" }),
    });
  });
  it("removes the active image and schedules deletion through Chat2Media trigger", async () => {
    await expect(removeGroupAvatar("alice", "group1")).resolves.toEqual({ avatarUrl: null });
    expect(mock.conversation.update).toHaveBeenCalledWith({ where: { id: "group1" }, data: { avatarMediaId: null } });
    expect(mock.media.deleteMany).toHaveBeenCalledWith({ where: { id: "old-avatar", conversationId: "group1", status: "AVATAR", messageId: null } });
  });
  it("does not sign or expose a private group avatar to a nonmember", async () => {
    mock.member.findUnique.mockResolvedValue(null);
    await expect(chatDetails("stranger", "group1")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(mock.signed).not.toHaveBeenCalled();
  });
});
