import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  chatFind: vi.fn(),
  chatUpdate: vi.fn(),
  eventFind: vi.fn(),
  eventUpdate: vi.fn(),
  notificationFind: vi.fn(),
  notificationCreate: vi.fn(),
  stepCreate: vi.fn(),
  stepUpdate: vi.fn(),
  subscriptions: vi.fn(),
  pushAdd: vi.fn(),
  channelQuery: vi.fn(),
  isAssignedTrainer: vi.fn(),
}));

vi.mock("@gafus/prisma", () => {
  const prisma = {
    cynologistChat: { findUnique: mock.chatFind, updateMany: mock.chatUpdate },
    chatWebhookEvent: { findUnique: mock.eventFind, update: mock.eventUpdate },
    chatNotification: { findUnique: mock.notificationFind, create: mock.notificationCreate },
    stepNotification: { create: mock.stepCreate, updateMany: mock.stepUpdate },
    pushSubscription: { findMany: mock.subscriptions },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };
  return { Prisma: {}, prisma };
});
vi.mock("@gafus/queues", () => ({
  connection: {},
  cynologistChatQueue: { add: vi.fn() },
  pushQueue: { add: mock.pushAdd },
}));
vi.mock("./service", () => ({ isAssignedChatTrainer: mock.isAssignedTrainer }));
vi.mock("./stream", () => ({
  CHAT_CHANNEL_TYPE: "gafus_cynologist",
  streamServer: () => ({ channel: () => ({ query: mock.channelQuery }) }),
}));

import { processChatEvent } from "./notifications";

const messageEvent = {
  type: "message.new",
  cid: "gafus_cynologist:channel-1",
  created_at: "2026-10-20T10:00:00Z",
  message: {
    id: "message-1",
    created_at: "2026-10-20T10:00:00Z",
    user: { id: "gafus-client-1" },
  },
};
const chat = {
  id: "chat-1",
  streamChannelId: "channel-1",
  provisionStatus: "READY",
  clientUserId: "client-1",
  trainerUserId: "trainer-1",
  lastClientMessageAt: null,
  unreadSince: null,
};
const pushId = "chat-message-message-1";

beforeEach(() => {
  vi.resetAllMocks();
  mock.eventFind.mockResolvedValue({ id: "event-1", processedAt: null, payload: messageEvent });
  mock.chatFind.mockResolvedValue(chat);
  mock.chatUpdate.mockResolvedValue({ count: 1 });
  mock.eventUpdate.mockResolvedValue({});
  mock.notificationCreate.mockResolvedValue({});
  mock.stepCreate.mockResolvedValue({});
  mock.stepUpdate.mockResolvedValue({ count: 0 });
  mock.subscriptions.mockResolvedValue([
    { endpoint: "ExponentPushToken[device]", keys: { p256dh: "expo", auth: "expo" } },
  ]);
  mock.pushAdd.mockResolvedValue({ id: pushId });
  mock.isAssignedTrainer.mockResolvedValue(true);
  mock.channelQuery.mockResolvedValue({
    read: [{ user: { id: "gafus-trainer-1" }, last_read: "2026-10-20T09:00:00Z", unread_messages: 1 }],
  });
});

describe("cynologist chat push enqueue", () => {
  it("stores the exact deterministic jobId before the push worker can consume a new job", async () => {
    mock.notificationFind.mockResolvedValueOnce(null).mockResolvedValue({ notificationId: pushId });

    await processChatEvent("event-1");

    expect(mock.stepCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: pushId,
        userId: "trainer-1",
        type: "immediate",
        jobId: pushId,
        url: "/cynologist-chats/chat-1",
      }),
    });
    expect(mock.pushAdd).toHaveBeenCalledWith(
      "push",
      { notificationId: pushId },
      expect.objectContaining({ jobId: pushId }),
    );
    expect(mock.eventUpdate).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("repairs a missing jobId on an existing outbox record before enqueuing", async () => {
    mock.notificationFind.mockResolvedValue({ notificationId: pushId });

    await processChatEvent("event-1");

    expect(mock.stepCreate).not.toHaveBeenCalled();
    expect(mock.stepUpdate).toHaveBeenCalledWith({
      where: { id: pushId, jobId: null },
      data: { jobId: pushId },
    });
    expect(mock.pushAdd).toHaveBeenCalledWith(
      "push",
      { notificationId: pushId },
      expect.objectContaining({ jobId: pushId }),
    );
  });

  it("does not create an undeliverable push when trainer has no subscriptions", async () => {
    mock.subscriptions.mockResolvedValue([]);
    mock.notificationFind.mockResolvedValueOnce(null).mockResolvedValue({ notificationId: null });

    await processChatEvent("event-1");

    expect(mock.notificationCreate).toHaveBeenCalledWith({
      data: { id: "message-message-1", chatId: "chat-1", userId: "trainer-1" },
    });
    expect(mock.stepCreate).not.toHaveBeenCalled();
    expect(mock.pushAdd).not.toHaveBeenCalled();
  });
});
