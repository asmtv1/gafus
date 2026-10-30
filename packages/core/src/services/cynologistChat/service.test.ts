import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  find: vi.fn(),
  user: vi.fn(),
  users: vi.fn(),
  upsertUsers: vi.fn(),
  rights: vi.fn(),
  op: vi.fn(),
  attachments: vi.fn(),
  getMessage: vi.fn(),
  send: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    cynologistChat: { findUnique: mock.find },
    user: { findUnique: mock.user, findMany: mock.users },
    chatAttachment: { findMany: mock.attachments },
    chatSendOperation: { upsert: mock.op, update: mock.update },
  },
}));
vi.mock("../appSubscription/accessService", () => ({ getCynologistEntitlements: mock.rights }));
vi.mock("./stream", () => ({
  CHAT_CHANNEL_TYPE: "gafus_cynologist",
  CHAT_STREAM_ROLE: "gafus_chat_reader",
  chatEnabled: () => true,
  requireChatSending: () => undefined,
  verifyChatPermissions: vi.fn(),
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
    upsertUsers: mock.upsertUsers,
    key: "test-key",
    createToken: () => "test-token",
    getMessage: mock.getMessage,
    channel: () => ({ cid: "gafus_cynologist:channel", sendMessage: mock.send }),
  }),
}));
import { chatForActor, sendChatMessage, getChatSession } from "./service";
const body = {
  clientMessageId: "b45152d8-47e8-4ea7-9eb0-42ba4ea81e38",
  text: "Здравствуйте",
  attachmentIds: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.find.mockResolvedValue({
    id: "chat",
    clientUserId: "client",
    trainerUserId: "trainer",
    streamChannelId: "channel",
    provisionStatus: "READY",
  });
  mock.rights.mockResolvedValue({ canUseCynologistChat: true, canBookConsultations: false });
  mock.attachments.mockResolvedValue([]);
});
describe("chat access and retries", () => {
  it("refreshes both participants' GAFUS nicknames and avatars when opening a private chat", async () => {
    mock.users.mockResolvedValue([
      { id: "client", username: "owner", profile: { avatarUrl: "https://example.com/owner.jpg" } },
      { id: "trainer", username: "admin", profile: { avatarUrl: "https://example.com/admin.jpg" } },
    ]);
    await getChatSession("client");
    expect(mock.upsertUsers).toHaveBeenCalledWith([
      {
        id: "gafus-client",
        role: "gafus_chat_reader",
        name: "owner",
        image: "https://example.com/owner.jpg",
      },
      {
        id: "gafus-trainer",
        role: "gafus_chat_reader",
        name: "admin",
        image: "https://example.com/admin.jpg",
      },
    ]);
  });
  it("retries exactly once for an idempotent temporary provider user-sync 503", async () => {
    mock.users.mockResolvedValue([
      { id: "client", username: "owner", profile: { avatarUrl: null } },
      { id: "trainer", username: "trainer", profile: { avatarUrl: null } },
    ]);
    mock.upsertUsers.mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({});
    await expect(getChatSession("client")).resolves.toMatchObject({
      userId: "gafus-client", channelId: "channel",
    });
    expect(mock.upsertUsers).toHaveBeenCalledTimes(2);
    expect(mock.upsertUsers.mock.calls[1][0]).toEqual(mock.upsertUsers.mock.calls[0][0]);
  });
  it("does not retry a provider permission rejection or an unknown error", async () => {
    mock.users.mockResolvedValue([]);
    const denial = { code: 17, response: { status: 403 } };
    mock.upsertUsers.mockRejectedValueOnce(denial);
    await expect(getChatSession("client")).rejects.toBe(denial);
    expect(mock.upsertUsers).toHaveBeenCalledTimes(1);
    mock.upsertUsers.mockReset().mockRejectedValueOnce({ code: "ECONNRESET", response: { status: 403 } });
    await expect(getChatSession("client")).rejects.toMatchObject({ response: { status: 403 } });
    expect(mock.upsertUsers).toHaveBeenCalledTimes(1);
    mock.upsertUsers.mockReset().mockRejectedValueOnce(Error("UNCLASSIFIED_PROVIDER_ERROR"));
    await expect(getChatSession("client")).rejects.toThrow("UNCLASSIFIED_PROVIDER_ERROR");
    expect(mock.upsertUsers).toHaveBeenCalledTimes(1);
  });
  it("fails closed when both temporary provider attempts fail", async () => {
    mock.users.mockResolvedValue([]);
    const transient = { code: "ECONNRESET" };
    const secondFailure = { response: { status: 503 } };
    mock.upsertUsers.mockRejectedValueOnce(transient).mockRejectedValueOnce(secondFailure);
    await expect(getChatSession("client")).rejects.toBe(secondFailure);
    expect(mock.upsertUsers).toHaveBeenCalledTimes(2);
  });
  it("rejects another client before querying Stream", async () => {
    await expect(chatForActor("intruder", "chat")).rejects.toMatchObject({
      code: "CHAT_FORBIDDEN",
    });
    expect(mock.getMessage).not.toHaveBeenCalled();
  });
  it("rejects a former trainer even with the saved trainer ID", async () => {
    process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID = "trainer";
    mock.user.mockResolvedValue({ role: "USER" });
    await expect(chatForActor("trainer", "chat")).rejects.toMatchObject({ code: "CHAT_FORBIDDEN" });
  });
  it("checks expiry again before sending", async () => {
    mock.rights.mockResolvedValue({ canUseCynologistChat: false });
    await expect(sendChatMessage("client", body)).rejects.toMatchObject({
      code: "CHAT_SUBSCRIPTION_REQUIRED",
    });
    expect(mock.op).not.toHaveBeenCalled();
  });
  it("rejects a forged attachment ID", async () => {
    await expect(
      sendChatMessage("client", { ...body, attachmentIds: ["foreign"] }),
    ).rejects.toMatchObject({ code: "CHAT_ATTACHMENT_FORBIDDEN" });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("rejects reuse of an ID with different content", async () => {
    mock.op.mockResolvedValue({ chatId: "chat", payloadHash: "different" });
    await expect(sendChatMessage("client", body)).rejects.toMatchObject({
      code: "CHAT_MESSAGE_CONFLICT",
    });
  });
  it("does not allow a session on a partially provisioned chat", async () => {
    mock.find.mockResolvedValue({ id: "chat", clientUserId: "client", provisionStatus: "PENDING" });
    await expect(getChatSession("client")).rejects.toMatchObject({ code: "CHAT_NOT_READY" });
  });
});
