import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    pushSubscription: { findMany: (...a: unknown[]) => mocks.list(...a) },
    stepNotification: {
      create: (...a: unknown[]) => mocks.create(...a),
      update: (...a: unknown[]) => mocks.update(...a),
    },
  },
}));
vi.mock("@gafus/queues", () => ({
  pushQueue: { add: (...a: unknown[]) => mocks.enqueue(...a) },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(),
  }),
}));

import { sendImmediatePushNotification } from "./immediatePushService";

describe("immediate push delivery business lifecycle in core", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.list.mockResolvedValue([
      { endpoint: "https://push.example.test/endpoint", keys: { p256dh: "key", auth: "auth" } },
    ]);
    mocks.create.mockResolvedValue({ id: "notice-1" });
    mocks.enqueue.mockResolvedValue({ id: "job-1" });
    mocks.update.mockResolvedValue({});
  });

  it("returns a helpful failure before storing anything without push subscribers", async () => {
    mocks.list.mockResolvedValue([]);
    expect(await sendImmediatePushNotification({
      userId: "user-1", title: "Заголовок", body: "Сообщение",
    })).toEqual({ success: false, error: "У пользователя нет активных подписок" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("persists the notification and records its queue job ID in core", async () => {
    expect(await sendImmediatePushNotification({
      userId: "user-1", title: "Уведомление", body: "Описание", url: "/gafus",
    })).toEqual({ success: true, notificationId: "notice-1" });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1", type: "immediate", sent: false,
        stepTitle: "Уведомление|Описание", url: "/gafus",
      }),
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "push", { notificationId: "notice-1" },
      expect.objectContaining({ attempts: 3, backoff: { type: "exponential", delay: 1000 } }),
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "notice-1" },
      data: { jobId: "job-1" },
    });
  });

  it("does not report a failed queue delivery as successful", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis not ready"));
    expect(await sendImmediatePushNotification({
      userId: "user-1", title: "Title", body: "Body",
    })).toEqual({ success: false, error: "redis not ready" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
