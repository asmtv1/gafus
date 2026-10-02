import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
  verify: vi.fn(),
  inbox: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  Prisma: {},
  prisma: {
    cynologistChat: { findUnique: mock.find, updateMany: mock.update },
    chatWebhookEvent: { upsert: mock.inbox },
  },
}));
vi.mock("@gafus/queues", () => ({
  connection: {},
  cynologistChatQueue: { add: mock.queue },
  pushQueue: {},
}));
vi.mock("./service", () => ({ isAssignedChatTrainer: vi.fn() }));
vi.mock("./stream", () => ({
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
  streamServer: () => ({ verifyWebhook: mock.verify, channel: () => ({ query: mock.query }) }),
}));
import { acceptChatWebhook, refreshChatUnread } from "./notifications";
beforeEach(() => {
  vi.clearAllMocks();
  mock.find.mockResolvedValue({
    id: "chat",
    trainerUserId: "trainer",
    streamChannelId: "channel",
    provisionStatus: "READY",
    unreadSince: new Date("2026-10-01T07:00:00Z"),
    lastClientMessageAt: new Date("2026-10-01T08:00:00Z"),
  });
  mock.query.mockResolvedValue({
    read: [
      { user: { id: "gafus-trainer" }, last_read: "2026-10-01T06:00:00Z", unread_messages: 2 },
    ],
  });
  mock.verify.mockReturnValue(true);
});
describe("chat webhook and unread series", () => {
  it("rejects an invalid raw-body signature before persisting", async () => {
    mock.verify.mockReturnValue(false);
    await expect(acceptChatWebhook("{}", "bad")).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
    expect(mock.inbox).not.toHaveBeenCalled();
  });
  it("deduplicates message delivery independently of timestamps and omits private text", async () => {
    const event = {
      type: "message.new",
      cid: "gafus_cynologist:channel",
      created_at: "2026-10-01T07:00:00Z",
      message: { id: "message", user: { id: "gafus-client" }, text: "private" },
    };
    await acceptChatWebhook(JSON.stringify(event), "valid");
    await acceptChatWebhook(
      JSON.stringify({ ...event, created_at: "2026-10-01T08:00:00Z" }),
      "valid",
    );
    expect(mock.inbox.mock.calls[0][0].where.id).toBe(mock.inbox.mock.calls[1][0].where.id);
    expect(mock.inbox.mock.calls[0][0].create.payload.message).not.toHaveProperty("text");
  });
  it("delayed messages do not reset an existing schedule", async () => {
    await refreshChatUnread("chat", new Date(), new Date("2026-10-01T06:30:00Z"));
    expect(mock.update.mock.calls[0][0].where.unreadSince).toBeNull();
    expect(mock.update.mock.calls[1][0].data).not.toHaveProperty("nextReminderAt");
  });
  it("read state closes the series with a guard against newer messages", async () => {
    mock.query.mockResolvedValue({
      read: [
        { user: { id: "gafus-trainer" }, last_read: "2026-10-01T09:00:00Z", unread_messages: 0 },
      ],
    });
    expect(await refreshChatUnread("chat")).toBe(false);
    expect(mock.update.mock.calls[0][0]).toMatchObject({
      data: { unreadSince: null, nextReminderAt: null },
      where: {
        OR: [{ lastClientMessageAt: null }, { lastClientMessageAt: { lte: expect.any(Date) } }],
      },
    });
  });
});
