import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createImmediatePushNotification,
  createStepNotification,
  createStepNotificationForStepStart,
  pauseStepNotification,
  resetStepNotification,
  resumeStepNotification,
  toggleStepNotificationPause,
  deleteStepNotification,
  getDayFromDayOnCourseId,
} from "./stepNotificationService";

const mockPushSubscriptionFindMany = vi.fn();
const mockStepNotificationCreate = vi.fn();
const mockStepNotificationUpdate = vi.fn();
const mockStepNotificationFindFirst = vi.fn();
const mockStepNotificationDelete = vi.fn();
const mockDayOnCourseFindUnique = vi.fn();
const mockPushQueueAdd = vi.fn();
const mockPushQueueRemove = vi.fn();
const mockPushQueueGetJob = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: (...args: unknown[]) => mockPushSubscriptionFindMany(...args),
    },
    stepNotification: {
      create: (...args: unknown[]) => mockStepNotificationCreate(...args),
      update: (...args: unknown[]) => mockStepNotificationUpdate(...args),
      findFirst: (...args: unknown[]) => mockStepNotificationFindFirst(...args),
      delete: (...args: unknown[]) => mockStepNotificationDelete(...args),
    },
    dayOnCourse: {
      findUnique: (...args: unknown[]) => mockDayOnCourseFindUnique(...args),
    },
  },
}));

vi.mock("@gafus/queues", () => ({
  pushQueue: {
    add: (...args: unknown[]) => mockPushQueueAdd(...args),
    remove: (...args: unknown[]) => mockPushQueueRemove(...args),
    getJob: (...args: unknown[]) => mockPushQueueGetJob(...args),
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("createImmediatePushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NO_SUBSCRIPTIONS when user has no subscriptions", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([]);

    const result = await createImmediatePushNotification({
      userId: "user-1",
      title: "Test",
      body: "Body",
    });

    expect(result).toEqual({ queued: false, reason: "NO_SUBSCRIPTIONS" });
    expect(mockStepNotificationCreate).not.toHaveBeenCalled();
  });

  it("queues notification when subscriptions exist", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      { endpoint: "ep1", keys: {} },
    ]);
    mockStepNotificationCreate.mockResolvedValue({
      id: "notif-1",
      day: 0,
      stepIndex: 0,
    });
    mockPushQueueAdd.mockResolvedValue({ id: "job-1" });
    mockStepNotificationUpdate.mockResolvedValue({});

    const result = await createImmediatePushNotification({
      userId: "user-1",
      title: "Title",
      body: "Body",
    });

    expect(result).toEqual({ queued: true, notificationId: "notif-1" });
    expect(mockPushQueueAdd).toHaveBeenCalledWith(
      "push",
      { notificationId: "notif-1" },
      expect.any(Object),
    );
  });

  it("returns QUEUE_ERROR when queue add fails", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      { endpoint: "ep1", keys: {} },
    ]);
    mockStepNotificationCreate.mockResolvedValue({
      id: "notif-1",
      day: 0,
      stepIndex: 0,
    });
    mockPushQueueAdd.mockRejectedValue(new Error("Queue down"));

    const result = await createImmediatePushNotification({
      userId: "user-1",
      title: "T",
      body: "B",
    });

    expect(result).toEqual({
      queued: false,
      reason: "QUEUE_ERROR",
      notificationId: "notif-1",
    });
  });
});

describe("createStepNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no push subscriptions", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([]);

    await expect(
      createStepNotification({
        userId: "user-1",
        day: 1,
        stepIndex: 0,
        durationSec: 60,
      }),
    ).rejects.toThrow("No push subscriptions found for user");

    expect(mockStepNotificationCreate).not.toHaveBeenCalled();
  });

  it("creates notification and queues job when subscriptions exist", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      { endpoint: "ep1", keys: { p256dh: "k1", auth: "a1" } },
    ]);
    mockStepNotificationCreate.mockResolvedValue({ id: "notif-1" });
    mockPushQueueAdd.mockResolvedValue({ id: "job-1" });
    mockStepNotificationUpdate.mockResolvedValue({});

    await createStepNotification({
      userId: "user-1",
      day: 1,
      stepIndex: 0,
      durationSec: 60,
    });

    expect(mockStepNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscription: expect.objectContaining({ count: 1 }),
          endTs: expect.any(Number),
          stepTitle: null,
        }),
      }),
    );
    expect(mockPushQueueAdd).toHaveBeenCalledWith(
      "push",
      { notificationId: "notif-1" },
      expect.objectContaining({ delay: 60_000 }),
    );
  });

  it("uses null stepTitle when stepTitle is empty string", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      { endpoint: "ep1", keys: {} },
    ]);
    mockStepNotificationCreate.mockResolvedValue({ id: "notif-1" });
    mockPushQueueAdd.mockResolvedValue({ id: "job-1" });
    mockStepNotificationUpdate.mockResolvedValue({});

    await createStepNotification({
      userId: "user-1",
      day: 1,
      stepIndex: 2,
      durationSec: 60,
      stepTitle: "",
    });

    expect(mockStepNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stepTitle: null }),
      }),
    );
  });

  it("uses null stepTitle when stepTitle is null", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      { endpoint: "ep1", keys: {} },
    ]);
    mockStepNotificationCreate.mockResolvedValue({ id: "notif-1" });
    mockPushQueueAdd.mockResolvedValue({ id: "job-1" });
    mockStepNotificationUpdate.mockResolvedValue({});

    await createStepNotification({
      userId: "user-1",
      day: 1,
      stepIndex: 0,
      durationSec: 60,
      stepTitle: null,
    });

    expect(mockStepNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stepTitle: null }),
      }),
    );
  });
});

describe("pauseStepNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPushQueueRemove.mockResolvedValue(undefined);
    mockStepNotificationUpdate.mockResolvedValue({});
  });

  it("returns early when no active notification found", async () => {
    mockStepNotificationFindFirst.mockResolvedValue(null);

    await pauseStepNotification("user-1", 1, 0);

    expect(mockPushQueueRemove).not.toHaveBeenCalled();
    expect(mockStepNotificationUpdate).not.toHaveBeenCalled();
  });

  it("removes job and updates paused when notification found with jobId", async () => {
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: "j1",
      remainingSec: null,
    });

    await pauseStepNotification("user-1", 1, 0, 30);

    expect(mockPushQueueRemove).toHaveBeenCalledWith("j1");
    expect(mockStepNotificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paused: true,
          remainingSec: 30,
          jobId: null,
        }),
      }),
    );
  });

  it("returns early when notification has no jobId", async () => {
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: null,
      remainingSec: null,
    });

    await pauseStepNotification("user-1", 1, 0);

    expect(mockPushQueueRemove).not.toHaveBeenCalled();
    expect(mockStepNotificationUpdate).not.toHaveBeenCalled();
  });
});

describe("resetStepNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPushQueueRemove.mockResolvedValue(undefined);
    mockStepNotificationDelete.mockResolvedValue({});
  });

  it("returns early when no notification found", async () => {
    mockStepNotificationFindFirst.mockResolvedValue(null);

    await resetStepNotification("user-1", 1, 0);

    expect(mockStepNotificationDelete).not.toHaveBeenCalled();
  });

  it("removes job and deletes notification when found", async () => {
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: "j1",
    });

    await resetStepNotification("user-1", 1, 0);

    expect(mockPushQueueRemove).toHaveBeenCalledWith("j1");
    expect(mockStepNotificationDelete).toHaveBeenCalledWith({
      where: { id: "n1" },
    });
  });

  it("deletes notification even when jobId is null", async () => {
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: null,
    });

    await resetStepNotification("user-1", 1, 0);

    expect(mockPushQueueRemove).not.toHaveBeenCalled();
    expect(mockStepNotificationDelete).toHaveBeenCalledWith({
      where: { id: "n1" },
    });
  });
});

describe("resumeStepNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPushSubscriptionFindMany.mockResolvedValue([
      { endpoint: "ep1", keys: {} },
    ]);
    mockPushQueueAdd.mockResolvedValue({ id: "job-1" });
    mockStepNotificationUpdate.mockResolvedValue({});
  });

  it("creates new notification when not found without dayOnCourseId", async () => {
    mockStepNotificationFindFirst.mockResolvedValue(null);
    mockStepNotificationCreate.mockResolvedValue({ id: "n2" });

    await resumeStepNotification("user-1", 1, 0, 60);

    expect(mockStepNotificationCreate).toHaveBeenCalled();
    expect(mockPushQueueAdd).toHaveBeenCalled();
    expect(mockStepNotificationUpdate).toHaveBeenCalled();
  });

  it("fetches stepTitle from dayOnCourse when not found and dayOnCourseId provided", async () => {
    mockStepNotificationFindFirst.mockResolvedValue(null);
    mockDayOnCourseFindUnique.mockResolvedValue({
      id: "doc1",
      order: 1,
      day: {
        stepLinks: [{ step: { title: "Приседания" } }],
      },
      course: { type: "fitness" },
    });
    mockStepNotificationCreate.mockResolvedValue({ id: "n2" });

    await resumeStepNotification("user-1", 1, 0, 60, "doc1");

    expect(mockStepNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stepTitle: "Приседания",
          url: "/trainings/fitness/doc1",
        }),
      }),
    );
  });

  it("updates existing notification and adds job when found with remainingSec", async () => {
    const nowTs = Math.floor(Date.now() / 1000);
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      remainingSec: 60,
      endTs: nowTs + 60,
    });

    await resumeStepNotification("user-1", 1, 0, 0);

    expect(mockStepNotificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "n1" },
        data: expect.objectContaining({ endTs: expect.any(Number) }),
      }),
    );
    expect(mockPushQueueAdd).toHaveBeenCalledWith(
      "push",
      { notificationId: "n1" },
      expect.objectContaining({ delay: 60_000 }),
    );
  });

  it("deletes expired notification when remainingSec is 0", async () => {
    const nowTs = Math.floor(Date.now() / 1000);
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      remainingSec: 0,
      endTs: nowTs - 100,
    });

    await resumeStepNotification("user-1", 1, 0, 0);

    expect(mockStepNotificationDelete).toHaveBeenCalledWith({
      where: { id: "n1" },
    });
    expect(mockPushQueueAdd).not.toHaveBeenCalled();
  });
});

describe("toggleStepNotificationPause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPushQueueGetJob.mockResolvedValue({
      remove: vi.fn().mockResolvedValue(undefined),
    });
    mockPushQueueAdd.mockResolvedValue({ id: "job-new" });
    mockStepNotificationUpdate.mockResolvedValue({});
  });

  it("returns error when notification not found", async () => {
    mockStepNotificationFindFirst.mockResolvedValue(null);

    const result = await toggleStepNotificationPause("user-1", 1, 0, true);

    expect(result).toEqual({ success: false, error: "Notification not found" });
  });

  it("pauses: removes job via getJob and updates paused=true", async () => {
    const nowTs = Math.floor(Date.now() / 1000);
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: "j1",
      endTs: nowTs + 60,
    });

    const result = await toggleStepNotificationPause("user-1", 1, 0, true);

    expect(result).toEqual({ success: true });
    expect(mockPushQueueGetJob).toHaveBeenCalledWith("j1");
    expect(mockStepNotificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paused: true,
          jobId: null,
        }),
      }),
    );
  });

  it("resumes: adds new job and updates paused=false", async () => {
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: null,
      remainingSec: 30,
    });

    const result = await toggleStepNotificationPause("user-1", 1, 0, false);

    expect(result).toEqual({ success: true });
    expect(mockPushQueueAdd).toHaveBeenCalled();
    expect(mockStepNotificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paused: false,
          jobId: "job-new",
        }),
      }),
    );
  });
});

describe("deleteStepNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPushQueueGetJob.mockResolvedValue({
      remove: vi.fn().mockResolvedValue(undefined),
    });
    mockStepNotificationDelete.mockResolvedValue({});
  });

  it("returns error when notification not found", async () => {
    mockStepNotificationFindFirst.mockResolvedValue(null);

    const result = await deleteStepNotification("user-1", 1, 0, true);

    expect(result).toEqual({ success: false, error: "Notification not found" });
  });

  it("removes job and deletes when deleted=true", async () => {
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: "j1",
    });

    const result = await deleteStepNotification("user-1", 1, 0, true);

    expect(result).toEqual({ success: true });
    expect(mockPushQueueGetJob).toHaveBeenCalledWith("j1");
    expect(mockStepNotificationDelete).toHaveBeenCalledWith({
      where: { id: "n1" },
    });
  });

  it("returns error when deleted=false", async () => {
    mockStepNotificationFindFirst.mockResolvedValue({
      id: "n1",
      jobId: null,
    });

    const result = await deleteStepNotification("user-1", 1, 0, false);

    expect(result).toEqual({
      success: false,
      error: "Cannot resume. Notification was deleted on pause.",
    });
    expect(mockStepNotificationDelete).not.toHaveBeenCalled();
  });
});

describe("createStepNotificationForStepStart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPushSubscriptionFindMany.mockResolvedValue([{ endpoint: "ep", keys: {} }]);
    mockStepNotificationCreate.mockResolvedValue({ id: "n1" });
    mockPushQueueAdd.mockResolvedValue({ id: "j1" });
    mockStepNotificationUpdate.mockResolvedValue({});
  });

  it("returns STEP_NOT_FOUND when dayOnCourse not found", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue(null);

    const result = await createStepNotificationForStepStart(
      "user-1",
      "day-1",
      0,
      60,
    );

    expect(result).toEqual({ queued: false, reason: "STEP_NOT_FOUND" });
  });

  it("returns STEP_NOT_FOUND when stepLink missing", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue({
      id: "day-1",
      order: 1,
      day: { stepLinks: [] },
      course: { type: "fitness" },
    });

    const result = await createStepNotificationForStepStart(
      "user-1",
      "day-1",
      0,
      60,
    );

    expect(result).toEqual({ queued: false, reason: "STEP_NOT_FOUND" });
  });
});

describe("getDayFromDayOnCourseId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns order when dayOnCourse found", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue({ order: 3 });

    const result = await getDayFromDayOnCourseId("day-1");

    expect(result).toBe(3);
  });

  it("throws when dayOnCourse not found", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue(null);

    await expect(getDayFromDayOnCourseId("invalid")).rejects.toThrow(
      /DayOnCourse not found/,
    );
  });
});
