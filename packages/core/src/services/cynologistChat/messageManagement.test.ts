import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@gafus/prisma", () => ({
  prisma: {
    communityChatSendOperation: { updateMany: vi.fn() },
    chatSendOperation: { updateMany: vi.fn() },
  },
}));
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  community: vi.fn(),
  get: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./service", () => ({ chatForActor: m.actor }));
vi.mock("./community", () => ({ requireCommunityCanSend: m.community }));
vi.mock("./stream", () => ({
  CHAT_CHANNEL_TYPE: "private",
  COMMUNITY_CHANNEL_TYPE: "public",
  COMMUNITY_CHANNEL_ID: "general",
  requireChatSending: vi.fn(),
  ChatError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  streamServer: () => ({
    getMessage: m.get,
    partialUpdateMessage: m.edit,
    deleteMessage: m.remove,
  }),
}));
import { manageOwnChatMessage } from "./messageManagement";
const now = new Date("2026-10-03T12:00:00Z");
function message(age: number, extra = {}) {
  m.get.mockResolvedValue({
    message: {
      id: "m",
      cid: "public:general",
      type: "regular",
      user: { id: "gafus-u" },
      created_at: new Date(now.getTime() - age),
      ...extra,
    },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  message(1000);
  m.actor.mockResolvedValue({ streamChannelId: "room" });
});
afterEach(() => vi.useRealTimers());
const edit = { action: "edit", messageId: "m", text: "Новый текст" };
const remove = { action: "delete", messageId: "m" };
describe("own message management", () => {
  it("edits only text before 15 minutes, preserving attachments", async () => {
    message(899999, { attachments: [{ type: "image" }] });
    await manageOwnChatMessage("u", edit, undefined, true);
    expect(m.edit).toHaveBeenCalledWith("m", { set: { text: "Новый текст" } }, "gafus-u");
  });
  it("rejects edits at 15 minutes even after a recent edit", async () => {
    message(900000, { updated_at: now });
    await expect(manageOwnChatMessage("u", edit, undefined, true)).rejects.toMatchObject({
      code: "CHAT_MESSAGE_TIME_EXPIRED",
    });
    expect(m.edit).not.toHaveBeenCalled();
  });
  it("hard deletes just before 24 hours", async () => {
    message(86399999);
    await manageOwnChatMessage("u", remove, undefined, true);
    expect(m.remove).toHaveBeenCalledWith("m", { hardDelete: true });
  });
  it("rejects deletion at 24 hours", async () => {
    message(86400000);
    await expect(manageOwnChatMessage("u", remove, undefined, true)).rejects.toMatchObject({
      code: "CHAT_MESSAGE_TIME_EXPIRED",
    });
    expect(m.remove).not.toHaveBeenCalled();
  });
  it.each([{ user: { id: "gafus-other" } }, { cid: "private:other" }])(
    "rejects foreign authors or channels",
    async (extra) => {
      message(1000, extra);
      await expect(manageOwnChatMessage("u", remove, undefined, true)).rejects.toMatchObject({
        code: "CHAT_FORBIDDEN",
      });
      expect(m.remove).not.toHaveBeenCalled();
    },
  );
  it("checks private-dialog access", async () => {
    message(1000, { cid: "private:room" });
    await manageOwnChatMessage("u", edit, "dialog");
    expect(m.actor).toHaveBeenCalledWith("u", "dialog");
    expect(m.edit).toHaveBeenCalled();
  });
  it("checks bans before provider calls", async () => {
    m.community.mockRejectedValueOnce(new Error("banned"));
    await expect(manageOwnChatMessage("u", edit, undefined, true)).rejects.toThrow("banned");
    expect(m.get).not.toHaveBeenCalled();
  });
  it.each([{ created_at: "invalid" }, { created_at: new Date(now.getTime() + 1000) }])(
    "rejects invalid timestamps",
    async (extra) => {
      message(1000, extra);
      await expect(manageOwnChatMessage("u", remove, undefined, true)).rejects.toMatchObject({
        code: "CHAT_MESSAGE_TIME_EXPIRED",
      });
    },
  );
  it.each([{ type: "deleted" }, { type: "system" }, { deleted_at: now }])(
    "rejects deleted and system messages",
    async (extra) => {
      message(1000, extra);
      await expect(manageOwnChatMessage("u", edit, undefined, true)).rejects.toMatchObject({
        code: "CHAT_MESSAGE_UNAVAILABLE",
      });
    },
  );
  it("rejects empty text without attachments", async () => {
    await expect(
      manageOwnChatMessage("u", { ...edit, text: " " }, undefined, true),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(m.edit).not.toHaveBeenCalled();
  });
});
