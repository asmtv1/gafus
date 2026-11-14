import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ community: vi.fn(), private: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    communityChatSendOperation: { updateMany: m.community },
    chatSendOperation: { updateMany: m.private },
  },
}));
import { persistChatMessageDeletion } from "./message-tombstone.js";

beforeEach(() => vi.clearAllMocks());
describe("durable deletion tombstone", () => {
  it.each([true, false])("uses only the authenticated %s channel operation", async (community) => {
    await persistChatMessageDeletion({ userId: "actor", messageId: "msg", community });
    const expected = { where: { streamMessageId: "msg", senderUserId: "actor" }, data: { state: "DELETED" } };
    expect(community ? m.community : m.private).toHaveBeenCalledWith(expected);
    expect(community ? m.private : m.community).not.toHaveBeenCalled();
  });
  it("propagates database failure so provider hard-delete is never attempted", async () => {
    m.private.mockRejectedValueOnce(new Error("db down"));
    await expect(persistChatMessageDeletion({ userId: "actor", messageId: "msg", community: false }))
      .rejects.toThrow("db down");
  });
});
