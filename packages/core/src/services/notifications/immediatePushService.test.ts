import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
  claim: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    pushSubscription: { findFirst: (...a: unknown[]) => mocks.list(...a) },
    stepNotification: {
      create: (...a: unknown[]) => mocks.create(...a),
      upsert: mocks.upsert,
      updateMany: mocks.claim,
    },
  },
}));
vi.mock("@gafus/queues", () => ({
  pushQueue: { add: (...a: unknown[]) => mocks.enqueue(...a) },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

import { sendImmediatePushNotification } from "@gafus/notifications-server/immediatePushService";

describe("immediate push delivery business lifecycle in core", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.list.mockResolvedValue({ id: "device-1" });
    mocks.create.mockImplementation(async ({ data }) => data);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.enqueue.mockResolvedValue({});
  });

  it("returns a helpful failure before storing anything without push subscribers", async () => {
    mocks.list.mockResolvedValue(null);
    expect(
      await sendImmediatePushNotification({
        userId: "user-1",
        title: "Заголовок",
        body: "Сообщение",
      }),
    ).toEqual({ success: false, error: "У пользователя нет активных подписок" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("persists the notification and records its queue job ID in core", async () => {
    expect(
      await sendImmediatePushNotification({
        userId: "user-1",
        title: "Уведомление",
        body: "Описание",
        url: "/gafus",
      }),
    ).toEqual({ success: true, notificationId: expect.any(String) });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "immediate",
        sent: false,
        stepTitle: "Уведомление|Описание",
        url: "/gafus",
      }),
    });
    const { id, jobId, subscription } = mocks.create.mock.calls[0]![0].data;
    expect(subscription).toEqual({});
    expect(jobId).toBe(`immediate-${id}`);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "push",
      { notificationId: id },
      expect.objectContaining({ jobId, attempts: 3, backoff: { type: "exponential", delay: 1000 } }),
    );

  });

  it("does not report a failed queue delivery as successful", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis not ready"));
    expect(
      await sendImmediatePushNotification({
        userId: "user-1",
        title: "Title",
        body: "Body",
      }),
    ).toEqual({ success: false, error: "redis not ready" });

  });
  it("recovers a failed Redis publication with the original receipt and queue ID", async () => {
    const request = { userId: "user-1", title: "Meeting", body: "Now",
      consultationReminder: { bookingId: "booking-1", key: "start-client" as const } };
    const receipt = { id: "receipt-1", jobId: "immediate-receipt-1" };
    mocks.upsert.mockResolvedValue(receipt);
    mocks.enqueue.mockRejectedValueOnce(new Error("offline"));
    expect((await sendImmediatePushNotification(request)).success).toBe(false);
    expect(await sendImmediatePushNotification(request)).toEqual({ success: true, notificationId: receipt.id });
    for (const [args] of mocks.upsert.mock.calls) {
      expect(args.where).toEqual({ consultationBookingId_consultationReminderKey: {
        consultationBookingId: "booking-1", consultationReminderKey: "start-client",
      } });
    }
    for (const [, payload, options] of mocks.enqueue.mock.calls) {
      expect(payload).toEqual({ notificationId: receipt.id });
      expect(options).toMatchObject({ jobId: receipt.jobId, removeOnFail: true });
    }
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    mocks.claim.mockResolvedValue({ count: 0 });
    await sendImmediatePushNotification(request);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  });
});
