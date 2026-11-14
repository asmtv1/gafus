import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingStatus } from "@gafus/types";
const m = vi.hoisted(() => ({
  enrollment: vi.fn(),
  days: vi.fn(),
  shared: vi.fn(),
  statuses: vi.fn(),
  steps: vi.fn(),
  write: vi.fn(),
  account: vi.fn(),
  timeline: vi.fn(),
  dayTrainings: vi.fn(),
  error: vi.fn(),
}));
vi.mock("./userProgressRows", () => ({
  readOwnedCourseProgressRow: m.enrollment,
  readCourseDaysProgressRows: m.days,
  readSharedCompletedTrainingRows: m.shared,
  readOwnedCourseTrainingStatuses: m.statuses,
  readTrainingStartedSteps: m.steps,
  writeOwnedUserCourseProgress: m.write,
  readProgressDisplayAccount: m.account,
  readOwnedCourseTrainingTimeline: m.timeline,
  readOwnedCourseTrainingDayRows: m.dayTrainings,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.error, info: vi.fn(), warn: vi.fn(), success: vi.fn() }),
}));
import { getDetailedUserProgress } from "./userProgressApplication";

const startedAt = new Date("2026-11-09T09:00:00Z");
const stepStartedAt = new Date("2026-11-09T09:11:00Z");
const day = {
  id: "link-A",
  dayId: "day-A",
  order: 1,
  day: {
    title: "Day A",
    shareProgressAcrossCourses: false,
    stepLinks: [{ id: "link-step-A", order: 1, step: { title: "Sit" } }],
  },
};
const enrollment = {
  status: TrainingStatus.NOT_STARTED,
  startedAt: null,
  completedAt: null,
  user: { username: "owner-a", profile: { avatarUrl: "safe-photo" } },
};

beforeEach(() => {
  vi.resetAllMocks();
  m.enrollment.mockResolvedValue(enrollment);
  m.days.mockResolvedValue([day]);
  m.shared.mockResolvedValue([]);
  m.statuses.mockResolvedValue([
    { id: "ut-A", status: TrainingStatus.IN_PROGRESS, dayOnCourseId: "link-A" },
  ]);
  m.steps.mockResolvedValue([{ id: "started-step", createdAt: stepStartedAt }]);
  m.write.mockResolvedValue({});
  m.account.mockResolvedValue({ username: "owner-a", profile: { avatarUrl: null } });
  m.timeline.mockResolvedValue([]);
  m.dayTrainings.mockResolvedValue([
    {
      dayOnCourseId: "link-A",
      status: TrainingStatus.IN_PROGRESS,
      steps: [
        {
          stepOnDayId: "link-step-A",
          status: TrainingStatus.IN_PROGRESS,
          createdAt: startedAt,
          updatedAt: stepStartedAt,
        },
      ],
    },
  ]);
});

describe("Owner-scoped learner progress application over SQL row ports", () => {
  it("readOnly must never write enrollment status, but uses actual step start time", async () => {
    const progress = await getDetailedUserProgress("owner-A", "course-A", { readOnly: true });
    expect(progress).toMatchObject({
      userId: "owner-A",
      username: "owner-a",
      avatarUrl: "safe-photo",
      startedAt: stepStartedAt,
      days: [
        {
          dayOrder: 1,
          dayTitle: "Day A",
          status: TrainingStatus.IN_PROGRESS,
          steps: [{ stepOrder: 1, stepTitle: "Sit", status: TrainingStatus.IN_PROGRESS }],
        },
      ],
    });
    expect(m.write).not.toHaveBeenCalled();
    expect(m.enrollment).toHaveBeenCalledExactlyOnceWith("owner-A", "course-A");
    expect(m.dayTrainings).toHaveBeenCalledExactlyOnceWith("owner-A", "course-A");
  });
  it("non-readOnly persists first real progress with owner/course scope", async () => {
    const progress = await getDetailedUserProgress("owner-A", "course-A");
    expect(progress?.startedAt).toEqual(stepStartedAt);
    expect(m.write).toHaveBeenCalledExactlyOnceWith("owner-A", "course-A", {
      status: TrainingStatus.IN_PROGRESS,
      startedAt: stepStartedAt,
    });
  });
  it("reconciles a completed direct day plus a shared completed day without double-counting", async () => {
    m.enrollment.mockResolvedValueOnce({
      ...enrollment,
      status: TrainingStatus.IN_PROGRESS,
      startedAt,
    });
    m.days.mockResolvedValueOnce([
      day,
      {
        ...day,
        id: "link-B",
        dayId: "day-B",
        order: 2,
        day: { ...day.day, title: "Shared B", shareProgressAcrossCourses: true },
      },
    ]);
    m.statuses.mockResolvedValueOnce([
      {
        id: "ut-A",
        status: TrainingStatus.COMPLETED,
        dayOnCourseId: "link-A",
      },
    ]);
    m.steps.mockResolvedValueOnce([{ id: "started-step", createdAt: stepStartedAt }]);
    m.shared.mockResolvedValueOnce([
      {
        status: TrainingStatus.COMPLETED,
        dayOnCourse: { dayId: "day-B" },
        steps: [
          {
            stepOnDayId: "link-step-A",
            status: TrainingStatus.COMPLETED,
            createdAt: startedAt,
            updatedAt: stepStartedAt,
          },
        ],
      },
    ]);
    m.dayTrainings.mockResolvedValueOnce([
      {
        dayOnCourseId: "link-A",
        status: TrainingStatus.COMPLETED,
        steps: [
          {
            stepOnDayId: "link-step-A",
            status: TrainingStatus.COMPLETED,
            createdAt: startedAt,
            updatedAt: stepStartedAt,
          },
        ],
      },
    ]);
    const progress = await getDetailedUserProgress("owner-A", "course-A");
    expect(progress?.days.map((d) => d.status)).toEqual([
      TrainingStatus.COMPLETED,
      TrainingStatus.COMPLETED,
    ]);
    expect(m.shared).toHaveBeenCalledExactlyOnceWith("owner-A", ["day-B"]);
    expect(m.write).toHaveBeenCalledExactlyOnceWith("owner-A", "course-A", {
      status: TrainingStatus.COMPLETED,
      startedAt,
      completedAt: expect.any(Date),
    });
  });
  it("absence of an enrollment still returns owner-scoped account and course progress, without writes", async () => {
    m.enrollment.mockResolvedValueOnce(null);
    m.statuses.mockResolvedValueOnce([]);
    m.dayTrainings.mockResolvedValueOnce([]);
    m.timeline.mockResolvedValueOnce([
      { createdAt: startedAt, updatedAt: startedAt, status: TrainingStatus.IN_PROGRESS },
    ]);
    const progress = await getDetailedUserProgress("owner-A", "course-A");
    expect(progress?.username).toBe("owner-a");
    expect(progress?.startedAt).toEqual(startedAt);
    expect(m.account).toHaveBeenCalledExactlyOnceWith("owner-A");
    expect(m.timeline).toHaveBeenCalledExactlyOnceWith("owner-A", "course-A");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("missing account or a database failure fails closed without exposing a different user's progress", async () => {
    m.enrollment.mockResolvedValueOnce(null);
    m.account.mockResolvedValueOnce(null);
    expect(await getDetailedUserProgress("not-found", "course-A")).toBeNull();
    expect(m.dayTrainings).not.toHaveBeenCalled();
    m.enrollment.mockRejectedValueOnce(new Error("DB connection error"));
    expect(await getDetailedUserProgress("owner-A", "course-A")).toBeNull();
    expect(m.error).toHaveBeenCalled();
  });
  it("failed status synchronization does not expose persistence errors in the response", async () => {
    m.write.mockRejectedValueOnce(new Error("db write failed"));
    const progress = await getDetailedUserProgress("owner-A", "course-A");
    expect(progress?.userId).toBe("owner-A");
    expect(m.error).toHaveBeenCalled();
  });
});
