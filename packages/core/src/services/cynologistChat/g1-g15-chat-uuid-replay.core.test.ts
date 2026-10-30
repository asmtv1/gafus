/** G15: real Core sendChatMessage + real Zod schema; injected DB and Stream ports.
 * Proves orchestration and stable IDs in process, not SQL or Stream-provider delivery.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  chat: vi.fn(), rights: vi.fn(), findAttachments: vi.fn(),
  upsert: vi.fn(), findOp: vi.fn(), update: vi.fn(),
  getMessage: vi.fn(), sendMessage: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  cynologistChat: { findUnique: m.chat },
  chatAttachment: { findMany: m.findAttachments },
  chatSendOperation: { upsert: m.upsert, findUniqueOrThrow: m.findOp, update: m.update },
} }));
vi.mock("../appSubscription/accessService", () => ({ getCynologistEntitlements: m.rights }));
vi.mock("./stream", () => ({
  CHAT_CHANNEL_TYPE: "gafus_cynologist", CHAT_STREAM_ROLE: "gafus_chat_reader",
  requireChatSending: () => undefined,
  ChatError: class ChatError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
  },
  streamServer: () => ({
    getMessage: m.getMessage,
    channel: () => ({ cid: "gafus_cynologist:channel-A", sendMessage: m.sendMessage }),
  }),
}));
import { sendChatMessage } from "./service";
const id = "b45152d8-47e8-4ea7-9eb0-42ba4ea81e38";
const body = { clientMessageId: id, text: "First text", attachmentIds: [] as string[] };
const operations = new Map<string, { id: string; chatId: string; payloadHash: string; streamMessageId: string; state: string }>();
const events = new Map<string, { id: string; cid: string; text: string; user: { id: string } }>();
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
beforeEach(() => {
  vi.clearAllMocks(); operations.clear(); events.clear();
  m.chat.mockResolvedValue({ id: "chat-A", clientUserId: "actor-A", trainerUserId: "trainer-T", streamChannelId: "channel-A", provisionStatus: "READY" });
  m.rights.mockResolvedValue({ canUseCynologistChat: true });
  m.findAttachments.mockResolvedValue([]);
  m.upsert.mockImplementation(async (args: { where: { senderUserId_clientMessageId: { senderUserId: string; clientMessageId: string } }; create: { chatId: string; senderUserId: string; clientMessageId: string; payloadHash: string; streamMessageId: string } }) => {
    const key = `${args.where.senderUserId_clientMessageId.senderUserId}/${args.where.senderUserId_clientMessageId.clientMessageId}`;
    let row = operations.get(key);
    if (!row) { row = { id: `operation-${key}`, chatId: args.create.chatId, payloadHash: args.create.payloadHash, streamMessageId: args.create.streamMessageId, state: "PENDING" };operations.set(key,row); }
    return row;
  });
  m.getMessage.mockImplementation(async (msgId: string) => {
    const message = events.get(msgId);
    if (!message) throw Object.assign(new Error("synthetic Stream not found"), { code: 16 });
    return { message };
  });
  m.sendMessage.mockImplementation(async (msg: { id: string; text: string; user_id: string }) => {
    const message = { id: msg.id, cid: "gafus_cynologist:channel-A", text: msg.text, user: { id: msg.user_id } };
    events.set(msg.id,message);
    return { message };
  });
  m.update.mockImplementation(async (args: { where: { id: string }, data: { state: string } }) => {
    const row = [...operations.values()].find(v => v.id === args.where.id);
    if (!row) throw new Error("expected operation");row.state = args.data.state;return row;
  });
});
describe("G15 real Core UUID replay and ACL with fake Prisma/Stream", () => {
  it("first UUID and identical replay return same message, one operation and one Stream send", async () => {
    const first = await sendChatMessage("actor-A", body, "chat-A");
    const second = await sendChatMessage("actor-A", { ...body }, "chat-A");
    expect(second).toEqual(first);
    expect(operations.size).toBe(1);
    expect(events.size).toBe(1);
    expect(m.sendMessage).toHaveBeenCalledTimes(1);
    expect(m.upsert).toHaveBeenCalledTimes(2);
    expect(first.id).toBe(`msg-${sha(`actor-A/${id}`)}`);
  });
  it("same UUID with changed payload yields 409 and no second send or operation", async () => {
    await sendChatMessage("actor-A", body, "chat-A");
    await expect(sendChatMessage("actor-A", { ...body, text: "changed" }, "chat-A"))
      .rejects.toMatchObject({ code: "CHAT_MESSAGE_CONFLICT", status: 409 });
    expect(operations.size).toBe(1);
    expect(events.size).toBe(1);
    expect(m.sendMessage).toHaveBeenCalledTimes(1);
  });
  it("foreign member is forbidden before DB operation/Stream", async () => {
    await expect(sendChatMessage("actor-B", body, "chat-A"))
      .rejects.toMatchObject({ code: "CHAT_FORBIDDEN", status: 403 });
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.sendMessage).not.toHaveBeenCalled();
  });
  it("invalid/non-UUID clientMessageId and empty message rejected before DB calls", async () => {
    await expect(sendChatMessage("actor-A", { ...body, clientMessageId: "idem-1" }, "chat-A")).rejects.toBeDefined();
    await expect(sendChatMessage("actor-A", { clientMessageId: id }, "chat-A")).rejects.toBeDefined();
    expect(m.chat).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("tombstoned message cannot be replayed even with the same UUID", async () => {
    await sendChatMessage("actor-A", body, "chat-A");
    const row = [...operations.values()][0]!;row.state = "DELETED";
    await expect(sendChatMessage("actor-A", body, "chat-A"))
      .rejects.toMatchObject({ code: "CHAT_MESSAGE_DELETED", status: 409 });
    expect(m.sendMessage).toHaveBeenCalledTimes(1);
    expect(events.size).toBe(1);
  });
});
