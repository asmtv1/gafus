import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  day: vi.fn(),
  step: vi.fn(),
  subscriptions: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    dayOnCourse: { findUnique: m.day },
    userStep: { findFirst: m.step },
    pushSubscription: { findMany: m.subscriptions },
    $queryRaw: m.queryRaw,
    stepNotification: {
      findUnique: m.findUnique,
      create: m.create,
      update: m.update,
      updateMany: m.updateMany,
      deleteMany: m.deleteMany,
      findFirst: m.findFirst,
    },
  },
  isPrismaUniqueConstraintError: (e: unknown) =>
    !!e && typeof e === "object" && "code" in e && e.code === "P2002",
}));
vi.mock("@gafus/queues", () => ({ pushQueue: { add: m.add, remove: m.remove } }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  createBoundStepNotificationForStart,
  pauseBoundStepNotification,
  resumeBoundStepNotification,
  resetBoundStepNotification,
} from "./stepNotificationService";

const bound = { dayOnCourseId: "dayoc1", stepOnDayId: "occB", stepId: "stepB" };
function fixtureLinks() {
  // Physical order is already rearranged relative to a stale client stepIndex.
  m.day.mockResolvedValue({
    id: "dayoc1",
    order: 7,
    course: { type: "practice" },
    day: {
      stepLinks: [
        { id: "occB", stepId: "stepB", step: { title: "Correct B" } },
        { id: "occA", stepId: "stepA", step: { title: "Other A" } },
      ],
    },
  });
  m.step.mockResolvedValue({ status: "IN_PROGRESS", paused: false, remainingSec: 40 });
}
describe("bound StepNotification uses immutable occurrence, mock queue sink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtureLinks();
    m.subscriptions.mockResolvedValue([
      { endpoint: "https://synthetic.invalid/no-push", keys: {} },
    ]);
    m.create.mockResolvedValue({ id: "notification-b" });
    m.update.mockResolvedValue({});
    m.add.mockResolvedValue({ id: "job-b" });
    m.remove.mockResolvedValue(undefined);
    m.findFirst.mockResolvedValue(null);
    m.findUnique.mockResolvedValue({
      id: "notification-b", userId: "learner", dayOnCourseId: "dayoc1",
      stepOnDayId: "occB", originalStepId: "stepB", type: "step",
      sent: false, paused: false, jobId: null, endTs: Math.floor(Date.now() / 1000) + 19,
      remainingSec: 19,
    });
    m.queryRaw.mockResolvedValue([{ id: "notification-b" }]);
    m.updateMany.mockResolvedValue({ count: 1 });
    m.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("reorder starts B, not stale positional A, with all three stable ids persisted", async () => {
    await expect(createBoundStepNotificationForStart("learner", bound, 60)).resolves.toEqual({
      queued: true,
    });
    expect(m.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "learner",
        day: 7,
        stepIndex: 0,
        dayOnCourseId: "dayoc1",
        stepOnDayId: "occB",
        originalStepId: "stepB",
        stepTitle: "Correct B",
        endTs: expect.any(Number),
      }),
      select: { id: true },
    });
    expect(m.add).toHaveBeenCalledExactlyOnceWith(
      "push",
      { notificationId: "notification-b" },
      expect.objectContaining({ delay: 60_000 }),
    );
  });

  it("duplicate delivery is an existing pending row, no second queued event", async () => {
    m.create
      .mockResolvedValueOnce({ id: "notification-b" })
      .mockRejectedValueOnce({ code: "P2002" });
    const first = await createBoundStepNotificationForStart("learner", bound, 60);
    const second = await createBoundStepNotificationForStart("learner", bound, 60);
    expect(first).toEqual({ queued: true });
    expect(second).toEqual({ queued: false, reason: "ALREADY_PENDING" });
    expect(m.add).toHaveBeenCalledTimes(1);
  });

  it("stale/deleted/foreign StepOnDay and completed step cannot produce an event", async () => {
    await expect(
      createBoundStepNotificationForStart(
        "learner",
        {
          ...bound,
          stepOnDayId: "other-link",
        },
        60,
      ),
    ).resolves.toMatchObject({ queued: false });
    await expect(
      createBoundStepNotificationForStart(
        "learner",
        {
          ...bound,
          stepId: "not-stepB",
        },
        60,
      ),
    ).resolves.toMatchObject({ queued: false });
    m.step.mockResolvedValueOnce({ status: "COMPLETED", paused: false });
    await expect(createBoundStepNotificationForStart("learner", bound, 60)).resolves.toEqual({
      queued: false,
      reason: "STALE_OR_INACTIVE_STEP",
    });
    expect(m.subscriptions).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.add).not.toHaveBeenCalled();
  });

  it("a push sink outage deletes only its own unqueued row", async () => {
    m.add.mockRejectedValueOnce(new Error("isolated queue down"));
    await expect(createBoundStepNotificationForStart("learner", bound, 60)).rejects.toThrow(
      "isolated queue down",
    );
    expect(m.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "notification-b", jobId: null },
    });
  });

  it("pause and reset address only current owner+day+occurrence, never day/index", async () => {
    m.findFirst.mockResolvedValue({
      id: "notification-b",
      jobId: "job-b",
      paused: false,
      remainingSec: null,
    });
    await pauseBoundStepNotification("learner", bound, 37);
    expect(m.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "learner",
        dayOnCourseId: "dayoc1",
        stepOnDayId: "occB",
        type: "step",
        sent: false,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(m.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dayOnCourseId: "dayoc1", stepOnDayId: "occB" }),
        data: { jobId: null, paused: true, remainingSec: 37 },
      }),
    );
    await resetBoundStepNotification("learner", bound);
    expect(m.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "notification-b",
        userId: "learner",
        dayOnCourseId: "dayoc1",
        stepOnDayId: "occB",
      }),
    });
  });

  it("resume uses stored seconds, does not manufacture a missing notification", async () => {
    await resumeBoundStepNotification("learner", bound);
    expect(m.add).not.toHaveBeenCalled();

    m.findFirst.mockResolvedValue({
      id: "notification-b",
      jobId: null,
      paused: true,
      remainingSec: 19,
    });
    await resumeBoundStepNotification("learner", bound);
    expect(m.add).toHaveBeenCalledWith(
      "push",
      { notificationId: "notification-b" },
      expect.objectContaining({ delay: 19_000 }),
    );
    expect(m.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paused: true, jobId: null, stepOnDayId: "occB" }),
        data: expect.objectContaining({ paused: false, endTs: expect.any(Number) }),
      }),
    );
  });
});
