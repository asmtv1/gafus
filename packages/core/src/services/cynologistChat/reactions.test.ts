import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  community: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  channel: vi.fn(),
}));
vi.mock("./service", () => ({ requireCanSend: m.actor }));
vi.mock("./community", () => ({ requireCommunityCanSend: m.community }));
vi.mock("./stream", () => ({
  CHAT_CHANNEL_TYPE: "private",
  COMMUNITY_CHANNEL_TYPE: "public",
  COMMUNITY_CHANNEL_ID: "general",
  ChatError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  streamServer: () => ({ getMessage: m.get, channel: m.channel }),
}));
import { manageChatReaction } from "./reactions";
beforeEach(() => {
  vi.clearAllMocks();
  m.actor.mockResolvedValue({ streamChannelId: "room" });
  m.community.mockResolvedValue(undefined);
  m.get.mockResolvedValue({
    message: {
      id: "m",
      cid: "public:general",
      type: "regular",
      user: { id: "another-user" },
      created_at: "2020-01-01",
    },
  });
  m.channel.mockReturnValue({ sendReaction: m.set, deleteReaction: m.remove });
});
const set = { messageId: "m", type: "love", action: "set" };
describe("chat reactions", () => {
  it("reacts to other authors and old messages, using authenticated identity and unique reaction", async () => {
    await manageChatReaction("u", { ...set, user_id: "victim" }, undefined, true);
    expect(m.community).toHaveBeenCalledWith("u");
    expect(m.set).toHaveBeenCalledWith(
      "m",
      { type: "love", user_id: "gafus-u" },
      { enforce_unique: true, skip_push: true },
    );
  });
  it("removes only authenticated user's reaction", async () => {
    await manageChatReaction("u", { ...set, action: "remove", user_id: "victim" }, undefined, true);
    expect(m.remove).toHaveBeenCalledWith("m", "love", "gafus-u");
    expect(m.set).not.toHaveBeenCalled();
  });
  it("checks private membership and subscription before provider mutation", async () => {
    m.actor.mockRejectedValueOnce(new Error("subscription required"));
    await expect(manageChatReaction("u", set, "chat")).rejects.toThrow("subscription required");
    expect(m.get).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
  });
  it("uses the authorized private channel", async () => {
    m.get.mockResolvedValueOnce({ message: { cid: "private:room", type: "regular" } });
    await manageChatReaction("u", set, "chat");
    expect(m.actor).toHaveBeenCalledWith("u", "chat");
    expect(m.channel).toHaveBeenCalledWith("private", "room");
  });
  it("rejects community moderation/access failures before provider mutation", async () => {
    m.community.mockRejectedValueOnce(new Error("blocked"));
    await expect(manageChatReaction("u", set, undefined, true)).rejects.toThrow("blocked");
    expect(m.set).not.toHaveBeenCalled();
  });
  it("rejects foreign channel messages", async () => {
    m.get.mockResolvedValueOnce({ message: { cid: "public:other" } });
    await expect(manageChatReaction("u", set, undefined, true)).rejects.toMatchObject({
      code: "CHAT_FORBIDDEN",
    });
    expect(m.set).not.toHaveBeenCalled();
  });
  it.each([{ type: "deleted" }, { type: "system" }, { type: "regular", deleted_at: "2026-01-01" }])(
    "rejects unavailable message %j",
    async (message) => {
      m.get.mockResolvedValueOnce({ message: { cid: "public:general", ...message } });
      await expect(manageChatReaction("u", set, undefined, true)).rejects.toMatchObject({
        code: "CHAT_MESSAGE_UNAVAILABLE",
      });
      expect(m.set).not.toHaveBeenCalled();
    },
  );
  it.each([{ type: "unknown" }, { action: "toggle" }, { messageId: "" }])(
    "rejects invalid input %j",
    async (input) => {
      await expect(
        manageChatReaction("u", { ...set, ...input }, undefined, true),
      ).rejects.toThrow();
      expect(m.get).not.toHaveBeenCalled();
    },
  );
});
