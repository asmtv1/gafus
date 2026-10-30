/** G1 real chat wildcard dispatcher with mocked Core and Redis. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  rate: vi.fn(), state: vi.fn(), communityState: vi.fn(),
  communitySend: vi.fn(), privateSend: vi.fn(),
  communitySession: vi.fn(), privateSession: vi.fn(),
  dialogs: vi.fn(), moderation: vi.fn(), overview: vi.fn(),
  reaction: vi.fn(), ownAction: vi.fn(), start: vi.fn(),
  upload: vi.fn(), deleteAttachment: vi.fn(),
}));
vi.mock("@gafus/queues", () => ({ connection: { eval: m.rate } }));
vi.mock("@gafus/core/services/cynologistChat", () => ({
  ChatError: class extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
  },
  getChatState: m.state, getCommunityChatState: m.communityState,
  getChatSession: m.privateSession, getCommunityChatSession: m.communitySession,
  listChatDialogs: m.dialogs, sendChatMessage: m.privateSend,
  sendCommunityChatMessage: m.communitySend,
  manageChatReaction: m.reaction, manageOwnChatMessage: m.ownAction,
  communityModerationOverview: m.overview, moderateCommunityChat: m.moderation,
  startChat: m.start,
}));
vi.mock("@gafus/core/services/cynologistChat/upload", () => ({
  deleteChatAttachment: m.deleteAttachment,
}));
vi.mock("./upload.js", () => ({ uploadChatAttachmentRequest: m.upload }));
import { chatHttpError, dispatchChatRequest } from "./index";
function call(action: string, method = "GET", body?: string, community = false, query = "") {
  return dispatchChatRequest("actor-A", new Request(`http://local.test/chat${query}`, {
    method, ...(body === undefined ? {} : { body }),
  }), action, community);
}
beforeEach(() => { vi.clearAllMocks(); m.rate.mockResolvedValue(1); });

describe("G1 chat dispatcher negative contracts", () => {
  it("routes private and community GET to different Core entry points", async () => {
    await call("", "GET", undefined, true);
    await call("", "GET", undefined, false, "?chatId=private-A");
    expect(m.communityState).toHaveBeenCalledWith("actor-A");
    expect(m.state).toHaveBeenCalledWith("actor-A", "private-A");
    expect(m.rate).not.toHaveBeenCalled();
  });
  it("rejects community chatId override before Core", async () => {
    await expect(call("", "GET", undefined, true, "?chatId=private-A"))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(m.communityState).not.toHaveBeenCalled();
  });
  it.each(["evil/path", "x".repeat(129)])("rejects malformed chatId %s", async chatId => {
    await expect(call("", "GET", undefined, false, `?chatId=${chatId}`))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(m.state).not.toHaveBeenCalled();
  });
  it("only exposes private dialogs and community moderation on correct GET", async () => {
    await call("dialogs", "GET", undefined, false, "?cursor=cursor-A");
    await call("moderation", "GET", undefined, true, "?cursor=cursor-B");
    expect(m.dialogs).toHaveBeenCalledWith("actor-A", "cursor-A");
    expect(m.overview).toHaveBeenCalledWith("actor-A", "cursor-B");
  });
  it("POST sessions use scoped actor regardless of supplied body userId", async () => {
    await call("session", "POST", '{"userId":"forged"}', true);
    await call("session", "POST", "{}", false, "?chatId=private-A");
    expect(m.communitySession).toHaveBeenCalledWith("actor-A");
    expect(m.privateSession).toHaveBeenCalledWith("actor-A", "private-A");
  });
  it("community send forwards actor not forged body userId", async () => {
    const body = { text: "hello", userId: "forged" };
    await call("messages", "POST", JSON.stringify(body), true);
    expect(m.communitySend).toHaveBeenCalledWith("actor-A", body);
    expect(m.privateSend).not.toHaveBeenCalled();
    expect(m.rate).toHaveBeenCalledWith(
      expect.any(String), 1, expect.stringMatching(/^chat-rate:community:actor-A:send:\d+$/),
    );
  });
  it("private message and reaction keep authenticated chatId", async () => {
    await call("messages", "POST", '{"text":"hello"}', false, "?chatId=private-A");
    await call("reactions", "POST", '{"messageId":"msg-A"}', false, "?chatId=private-A");
    expect(m.privateSend).toHaveBeenCalledWith("actor-A", { text: "hello" }, "private-A");
    expect(m.reaction).toHaveBeenCalledWith(
      "actor-A", { messageId: "msg-A" }, "private-A", false,
    );
  });
  it("rejects oversized message body before Core", async () => {
    await expect(call("messages", "POST", "x".repeat(32769), true))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(m.communitySend).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON before sending", async () => {
    await expect(call("messages", "POST", "not-json", false))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(m.privateSend).not.toHaveBeenCalled();
  });
  it("blocks 6th community attachment before upload", async () => {
    m.rate.mockResolvedValueOnce(6);
    await expect(call("attachments", "POST", "blob", true))
      .rejects.toMatchObject({ code: "CHAT_RATE_LIMIT", status: 429 });
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("blocks 11th private attachment before upload", async () => {
    m.rate.mockResolvedValueOnce(11);
    await expect(call("attachments", "POST", "blob"))
      .rejects.toMatchObject({ code: "CHAT_RATE_LIMIT", status: 429 });
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("community send limit 20 and private send limit 60 remain distinct", async () => {
    m.rate.mockResolvedValueOnce(21).mockResolvedValueOnce(61);
    await expect(call("messages", "POST", "{}", true))
      .rejects.toMatchObject({ code: "CHAT_RATE_LIMIT", status: 429 });
    await expect(call("messages", "POST", "{}"))
      .rejects.toMatchObject({ code: "CHAT_RATE_LIMIT", status: 429 });
    expect(m.communitySend).not.toHaveBeenCalled();
    expect(m.privateSend).not.toHaveBeenCalled();
  });
  it("unknown wildcard action fails closed without Core calls", async () => {
    await expect(call("unknown", "GET"))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(m.state).not.toHaveBeenCalled();
    expect(m.privateSend).not.toHaveBeenCalled();
  });
  it("GET cannot mutate message reactions or message actions", async () => {
    await expect(call("reactions", "GET")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("message-actions", "GET")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(m.reaction).not.toHaveBeenCalled();
    expect(m.ownAction).not.toHaveBeenCalled();
  });
  it("429 error envelope preserves machine code", async () => {
    m.rate.mockResolvedValueOnce(21);
    try { await call("messages", "POST", "{}", true); }
    catch (err) {
      expect(chatHttpError(err)).toMatchObject({
        status: 429, body: { success: false, code: "CHAT_RATE_LIMIT" },
      });
      return;
    }
    throw new Error("Expected chat rate limiting");
  });
});
// G1_TEST_FINISHED
