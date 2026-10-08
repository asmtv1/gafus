import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  communityState: vi.fn(),
  send: vi.fn(),
  moderation: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@gafus/queues", () => ({ connection: { eval: mocks.rate } }));
vi.mock("@gafus/core/services/cynologistChat", () => ({
  getChatState: mocks.state,
  getCommunityChatState: mocks.communityState,
  sendChatMessage: mocks.send,
  moderateCommunityChat: mocks.moderation,
  startChat: vi.fn(),
  getChatSession: vi.fn(),
  listChatDialogs: vi.fn(),
  manageChatReaction: vi.fn(),
  manageOwnChatMessage: vi.fn(),
  communityModerationOverview: vi.fn(),
  getCommunityChatSession: vi.fn(),
  sendCommunityChatMessage: vi.fn(),
  ChatError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock("@gafus/core/services/cynologistChat/upload", () => ({ deleteChatAttachment: vi.fn() }));
vi.mock("./upload.js", () => ({ uploadChatAttachmentRequest: vi.fn() }));
import { dispatchChatRequest, chatHttpError } from "./index";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rate.mockResolvedValue(1);
});
describe("shared HTTP adapter", () => {
  it("extracts the private chat ID and delegates the authenticated actor to core", async () => {
    mocks.state.mockResolvedValue({ canSend: false });
    expect(
      await dispatchChatRequest("actor", new Request("http://localhost/chat?chatId=private")),
    ).toEqual({ canSend: false });
    expect(mocks.state).toHaveBeenCalledWith("actor", "private");
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it("routes the community request to its domain service", async () => {
    await dispatchChatRequest("actor", new Request("http://localhost/chat"), "", true);
    expect(mocks.communityState).toHaveBeenCalledWith("actor");
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it("passes JSON unchanged to core without trusting a body actor", async () => {
    const body = { userId: "forged", text: "message" };
    await dispatchChatRequest(
      "actor",
      new Request("http://localhost/chat?chatId=private", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      "messages",
    );
    expect(mocks.send).toHaveBeenCalledWith("actor", body, "private");
  });
  it.each(["invalid", "x".repeat(32769)])(
    "rejects invalid or oversized JSON before core",
    async (body) => {
      await expect(
        dispatchChatRequest(
          "actor",
          new Request("http://localhost/chat", { method: "POST", body }),
          "messages",
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it("enforces the community rate limit before dispatch", async () => {
    mocks.rate.mockResolvedValue(21);
    await expect(
      dispatchChatRequest(
        "actor",
        new Request("http://localhost/chat", { method: "POST", body: "{}" }),
        "messages",
        true,
      ),
    ).rejects.toMatchObject({ code: "CHAT_RATE_LIMIT", status: 429 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects private IDs in community requests", async () => {
    await expect(
      dispatchChatRequest("actor", new Request("http://localhost/chat?chatId=private"), "", true),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.communityState).not.toHaveBeenCalled();
  });
  it("maps validation errors to the existing JSON contract", () => {
    const parsed = z.string().safeParse(123);
    if (parsed.success) throw new Error("Expected validation failure");
    expect(chatHttpError(parsed.error)).toMatchObject({
      status: 400,
      body: { success: false, code: "INVALID_INPUT" },
    });
  });
});
