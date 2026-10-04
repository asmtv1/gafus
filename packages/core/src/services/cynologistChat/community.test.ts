import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(),
  files: vi.fn(),
  op: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  bans: vi.fn(),
  getMessage: vi.fn(),
  deleteMessage: vi.fn(),
  ban: vi.fn(),
  unban: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: m.user },
    communityChatAttachment: { findMany: m.files },
    communityChatSendOperation: { upsert: m.op, update: m.update },
  },
}));
vi.mock("./stream", () => ({
  COMMUNITY_CHANNEL_TYPE: "gafus_community",
  COMMUNITY_CHANNEL_ID: "general",
  CHAT_STREAM_ROLE: "gafus_chat_reader",
  CHAT_CHANNEL_TYPE: "gafus_cynologist",
  ChatError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  verifyChatPermissions: m.verify,
  streamServer: () => ({
    key: "key",
    upsertUser: m.upsert,
    createToken: () => "token",
    queryBannedUsers: m.bans,
    getMessage: m.getMessage,
    deleteMessage: m.deleteMessage,
    channel: () => ({ create: m.create, banUser: m.ban, unbanUser: m.unban }),
  }),
}));
vi.mock("./service", async () => ({ ...(await vi.importActual("./service")), sendOnce: m.send }));
import {
  moderateCommunityChat,
  getCommunityChatState,
  getCommunityChatSession,
  sendCommunityChatMessage,
} from "./community";
const body = {
  clientMessageId: "b45152d8-47e8-4ea7-9eb0-42ba4ea81e38",
  text: "Привет",
  attachmentIds: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  process.env.COMMUNITY_CHAT_ENABLED = "true";
  m.user.mockResolvedValue({ id: "user", username: "имя", role: "USER" });
  m.bans.mockResolvedValue({ bans: [] });
  m.files.mockResolvedValue([]);
  m.op.mockImplementation(async ({ create }) => ({ id: "op", ...create }));
  m.send.mockResolvedValue({ message: { id: "message" } });
});
describe("registered community access", () => {
  it("allows a registered user without subscription or intake", async () => {
    expect(await getCommunityChatState("user")).toEqual({
      enabled: true,
      canSend: true,
      isModerator: false,
      isBanned: false,
    });
    await getCommunityChatSession("user");
    expect(m.verify).toHaveBeenCalledWith("gafus_community");
    expect(m.upsert).toHaveBeenCalledWith({
      id: "gafus-user",
      name: "имя",
      image: "",
      role: "gafus_chat_reader",
    });
  });
  it("syncs the Gafus nickname and profile avatar on each connection", async () => {
    m.user.mockResolvedValue({
      id: "user",
      username: "новый-ник",
      role: "USER",
      profile: { avatarUrl: "https://cdn.gafus.ru/avatar.jpg" },
    });
    await getCommunityChatSession("user");
    expect(m.upsert).toHaveBeenCalledWith({
      id: "gafus-user",
      name: "новый-ник",
      image: "https://cdn.gafus.ru/avatar.jpg",
      role: "gafus_chat_reader",
    });
  });
  it("rejects an unregistered account before Stream", async () => {
    m.user.mockResolvedValue(null);
    await expect(getCommunityChatSession("missing")).rejects.toMatchObject({
      code: "CHAT_UNAUTHORIZED",
    });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("uses an independent feature flag", async () => {
    process.env.COMMUNITY_CHAT_ENABLED = "false";
    expect((await getCommunityChatState("user")).canSend).toBe(false);
    await expect(sendCommunityChatMessage("user", body)).rejects.toMatchObject({
      code: "CHAT_DISABLED",
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("rejects foreign or private-chat attachments", async () => {
    await expect(
      sendCommunityChatMessage("user", { ...body, attachmentIds: ["private-file"] }),
    ).rejects.toMatchObject({ code: "CHAT_ATTACHMENT_FORBIDDEN" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("keeps retries in a namespace separate from private messages", async () => {
    await sendCommunityChatMessage("user", body);
    await sendCommunityChatMessage("user", body);
    const expected = `community-${createHash("sha256").update(`user/${body.clientMessageId}`).digest("hex")}`;
    expect(m.send.mock.calls.map((call) => call[1].id)).toEqual([expected, expected]);
  });
  it("never recreates a hard-deleted message on a repeated send", async () => {
    m.op.mockImplementation(async ({ create }) => ({ id: "op", ...create, state: "DELETED" }));
    await expect(sendCommunityChatMessage("user", body)).rejects.toMatchObject({
      code: "CHAT_MESSAGE_DELETED",
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("does not resend a completed message missing from Stream", async () => {
    m.op.mockImplementation(async ({ create }) => ({ id: "op", ...create, state: "SENT" }));
    m.getMessage.mockRejectedValueOnce({ code: 16 });
    await expect(sendCommunityChatMessage("user", body)).rejects.toMatchObject({
      code: "CHAT_MESSAGE_DELETED",
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("sends a quoted reply to another author's message in the same room", async () => {
    m.getMessage.mockResolvedValueOnce({
      message: {
        id: "original",
        cid: "gafus_community:general",
        user: { id: "gafus-other" },
        type: "regular",
      },
    });
    await sendCommunityChatMessage("user", { ...body, quotedMessageId: "original" });
    expect(m.send.mock.calls[0][1]).toMatchObject({
      quoted_message_id: "original",
      user_id: "gafus-user",
    });
  });
  it.each([
    { cid: "gafus_cynologist:private" },
    { cid: "gafus_community:general", deleted_at: new Date() },
  ])("rejects quotes from another room or deleted messages", async (message) => {
    m.getMessage.mockResolvedValueOnce({ message });
    await expect(
      sendCommunityChatMessage("user", { ...body, quotedMessageId: "original" }),
    ).rejects.toMatchObject({ code: "CHAT_QUOTE_UNAVAILABLE" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("binds reply identity into the retry payload", async () => {
    m.getMessage.mockResolvedValueOnce({ message: { cid: "gafus_community:general" } });
    m.op.mockResolvedValueOnce({
      id: "op",
      payloadHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    });
    await expect(
      sendCommunityChatMessage("user", { ...body, quotedMessageId: "original" }),
    ).rejects.toMatchObject({ code: "CHAT_MESSAGE_CONFLICT" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("rejects a reused identifier with another payload", async () => {
    m.op.mockResolvedValue({ id: "op", payloadHash: "different" });
    await expect(sendCommunityChatMessage("user", body)).rejects.toMatchObject({
      code: "CHAT_MESSAGE_CONFLICT",
    });
    expect(m.send).not.toHaveBeenCalled();
  });
});

describe("community moderation boundaries", () => {
  it("rejects an ordinary account before provider moderation", async () => {
    await expect(
      moderateCommunityChat("user", { action: "delete", messageId: "message" }),
    ).rejects.toMatchObject({ code: "CHAT_FORBIDDEN" });
    expect(m.getMessage).not.toHaveBeenCalled();
  });
  it("does not grant moderation by username without ADMIN role", async () => {
    m.user.mockResolvedValue({ id: "user", username: "admin", role: "USER" });
    await expect(
      moderateCommunityChat("user", { action: "ban", userId: "gafus-target" }),
    ).rejects.toMatchObject({ code: "CHAT_FORBIDDEN" });
  });
  it("rejects deletion of a private-channel message", async () => {
    m.user.mockResolvedValue({ id: "admin", username: "admin", role: "ADMIN" });
    m.getMessage.mockResolvedValue({ message: { cid: "gafus_cynologist:private" } });
    await expect(
      moderateCommunityChat("admin", { action: "delete", messageId: "private" }),
    ).rejects.toMatchObject({ code: "CHAT_FORBIDDEN" });
    expect(m.deleteMessage).not.toHaveBeenCalled();
  });
  it("allows admin to soft-delete only a community message", async () => {
    m.user.mockResolvedValue({ id: "admin", username: "admin", role: "ADMIN" });
    m.getMessage.mockResolvedValue({ message: { cid: "gafus_community:general" } });
    await moderateCommunityChat("admin", { action: "delete", messageId: "general-message" });
    expect(m.deleteMessage).toHaveBeenCalledWith("general-message");
  });
  it("blocks a banned sender before attachments or provider sending", async () => {
    m.bans.mockResolvedValue({ bans: [{ user: { id: "gafus-user" } }] });
    await expect(sendCommunityChatMessage("user", body)).rejects.toMatchObject({
      code: "CHAT_BANNED",
    });
    expect(m.files).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("fails closed if the provider omits ban state", async () => {
    m.bans.mockResolvedValue({});
    await expect(sendCommunityChatMessage("user", body)).rejects.toMatchObject({
      code: "CHAT_UNAVAILABLE",
    });
  });
  it("scopes bans and unbans to the community channel", async () => {
    m.user.mockImplementation(async ({ where }) =>
      where.id === "admin"
        ? { id: "admin", username: "admin", role: "ADMIN" }
        : { id: "target", username: "target", role: "USER" },
    );
    await moderateCommunityChat("admin", { action: "ban", userId: "gafus-target" });
    expect(m.ban).toHaveBeenCalledWith("gafus-target", {
      banned_by_id: "gafus-admin",
      reason: "Нарушение правил общего чата",
    });
    await moderateCommunityChat("admin", { action: "unban", userId: "gafus-target" });
    expect(m.unban).toHaveBeenCalledWith("gafus-target");
  });
  it("prevents banning the moderator", async () => {
    m.user.mockResolvedValue({ id: "admin", username: "admin", role: "ADMIN" });
    await expect(
      moderateCommunityChat("admin", { action: "ban", userId: "gafus-admin" }),
    ).rejects.toMatchObject({ code: "CHAT_FORBIDDEN" });
    expect(m.ban).not.toHaveBeenCalled();
  });
});
