import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTrainingDayContentCache,
  getTrainingDayContent,
  invalidateCourseContentCache,
  invalidateTrainingDayContentCache,
  invalidateTrainingDaysContentCache,
  invalidateStepsContentCache,
} from "./trainingDayContent";
import {
  getCourseCacheMetricsSnapshot,
  resetCourseCacheMetricsForTests,
} from "./trainingContentMetrics";

const mockFindFirst = vi.fn();
const revisionMock = vi.hoisted(() => ({
  read: vi.fn<() => Promise<string | null>>(),
  enabled: vi.fn(() => true),
}));
vi.mock("./trainingContentRevision", () => ({
  courseContentSyncEnabled: revisionMock.enabled,
  getVerifiedCourseContentRevision: revisionMock.read,
}));

vi.mock("@gafus/prisma", () => ({
  prisma: { dayOnCourse: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } },
}));

const record = (courseId: string, title: string) => ({
  id: "day-link",
  courseId,
  day: { title, stepLinks: [] },
  course: { duration: "30", isPersonalized: false },
});

const priorFlag = process.env.ENABLE_COURSE_CACHE;

describe("training day shared content cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCourseCacheMetricsForTests();
    revisionMock.enabled.mockReturnValue(true);
    revisionMock.read.mockResolvedValue("0");
    clearTrainingDayContentCache();
    process.env.ENABLE_COURSE_CACHE = "false";
  });

  afterEach(() => {
    clearTrainingDayContentCache();
    if (priorFlag === undefined) delete process.env.ENABLE_COURSE_CACHE;
    else process.env.ENABLE_COURSE_CACHE = priorFlag;
    vi.useRealTimers();
  });

  it("records hits, misses, Prisma reads and a failed PostgreSQL-version probe", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));
    await getTrainingDayContent("course", "day-link");
    await getTrainingDayContent("course", "day-link");
    revisionMock.read.mockResolvedValue(null);
    await getTrainingDayContent("course", "day-link");

    const metrics = getCourseCacheMetricsSnapshot();
    expect(metrics.counters).toMatchObject({
      miss: 1,
      hit: 1,
      bypassRevision: 1,
      revisionFlush: 0,
    });
    expect(metrics.prismaRead.count).toBe(2);
  });

  it("does not cache when the cluster revision synchronization is disabled", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    revisionMock.enabled.mockReturnValue(false);
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));

    await getTrainingDayContent("course", "day-link");
    await getTrainingDayContent("course", "day-link");

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
    expect(revisionMock.read).not.toHaveBeenCalled();
  });

  it("bypasses stale cache after the committed PostgreSQL revision changes", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst
      .mockResolvedValueOnce(record("course-1", "Old"))
      .mockResolvedValueOnce(record("course-1", "Updated"));

    const old = await getTrainingDayContent("course", "day-link");
    revisionMock.read.mockResolvedValue("1");
    const updated = await getTrainingDayContent("course", "day-link");

    expect(old?.day.title).toBe("Old");
    expect(updated?.day.title).toBe("Updated");
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("invalidates when PostgreSQL commits even if the Redis revision stays unchanged", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst
      .mockResolvedValueOnce(record("course-1", "Old"))
      .mockResolvedValueOnce(record("course-1", "Committed"));
    revisionMock.read.mockResolvedValueOnce("100").mockResolvedValueOnce("101");

    expect((await getTrainingDayContent("course", "day-link"))?.day.title).toBe("Old");
    expect((await getTrainingDayContent("course", "day-link"))?.day.title).toBe("Committed");
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("fails closed on PostgreSQL revision query failure and recovers from Prisma", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst
      .mockResolvedValueOnce(record("course-1", "Old"))
      .mockResolvedValueOnce(record("course-1", "From DB"))
      .mockResolvedValueOnce(record("course-1", "Recovery"));

    await getTrainingDayContent("course", "day-link");
    revisionMock.read.mockResolvedValue(null);
    const bypassed = await getTrainingDayContent("course", "day-link");

    revisionMock.read.mockResolvedValue("2");
    const recovered = await getTrainingDayContent("course", "day-link");

    expect(bypassed?.day.title).toBe("From DB");
    expect(recovered?.day.title).toBe("Recovery");
    expect(mockFindFirst).toHaveBeenCalledTimes(3);
  });

  it("does not regress to an older PostgreSQL revision when probes finish out of order", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    let resolveOld!: (revision: string) => void;
    revisionMock.read
      .mockResolvedValueOnce("0")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue("1");
    mockFindFirst
      .mockResolvedValueOnce(record("course-1", "Old"))
      .mockResolvedValue(record("course-1", "New"));

    await getTrainingDayContent("course", "day-link");
    const slowRequest = getTrainingDayContent("course", "day-link");
    const freshRequest = getTrainingDayContent("course", "day-link");
    const fresh = await freshRequest;
    resolveOld("0");
    const slower = await slowRequest;
    const latest = await getTrainingDayContent("course", "day-link");

    expect(fresh?.day.title).toBe("New");
    expect(slower?.day.title).toBe("New");
    expect(latest?.day.title).toBe("New");
  });

  it("is OFF by default: reads the database on every request", async () => {
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));

    await getTrainingDayContent("course", "day-link");
    await getTrainingDayContent("course", "day-link");

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("caches only shared Prisma fields with the day and course-type scoped key", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));

    const first = await getTrainingDayContent("course", "day-link");
    const second = await getTrainingDayContent("course", "day-link");

    expect(first).toEqual(second);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "day-link", course: { type: "course" } },
      select: expect.objectContaining({
        id: true,
        courseId: true,
        course: { select: { duration: true, isPersonalized: true } },
      }),
    });
    const select = mockFindFirst.mock.calls[0][0].select;
    expect(select.userTrainings).toBeUndefined();
    expect(select.course.select.userCourses).toBeUndefined();
    expect(select.course.select.access).toBeUndefined();
    expect(select.day.select.stepLinks.select.step.select.description).toBe(true);
  });

  it("isolates different days and course types", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));

    await getTrainingDayContent("course-a", "day-a");
    await getTrainingDayContent("course-a", "day-b");
    await getTrainingDayContent("course-b", "day-a");
    await getTrainingDayContent("course-a", "day-a");

    expect(mockFindFirst).toHaveBeenCalledTimes(3);
  });

  it("deduplicates concurrent cold-cache reads", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    let finish!: (value: ReturnType<typeof record>) => void;
    mockFindFirst.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const requests = Array.from({ length: 20 }, () => getTrainingDayContent("course", "day-link"));
    await vi.waitFor(() => expect(mockFindFirst).toHaveBeenCalledTimes(1));
    finish(record("course-1", "Lesson"));

    const responses = await Promise.all(requests);
    expect(responses.every((response) => response?.day.title === "Lesson")).toBe(true);
    await getTrainingDayContent("course", "day-link");
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("does not cache missing records", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockResolvedValue(null);
    await getTrainingDayContent("course", "missing");
    await getTrainingDayContent("course", "missing");
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("propagates DB errors and retries instead of saving a rejected promise", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst
      .mockRejectedValueOnce(new Error("db unavailable"))
      .mockResolvedValueOnce(record("course-1", "Restored"));

    await expect(getTrainingDayContent("course", "day-link")).rejects.toThrow("db unavailable");
    const recovered = await getTrainingDayContent("course", "day-link");

    expect(recovered?.day.title).toBe("Restored");
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("expires entries after the bounded 60-second TTL", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));

    await getTrainingDayContent("course", "day-link");
    vi.setSystemTime(new Date("2026-10-15T00:01:01Z"));
    await getTrainingDayContent("course", "day-link");

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("evicts least-recently-used entries beyond the size bound", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));

    await getTrainingDayContent("course", "day-0");
    for (let index = 1; index <= 256; index++) {
      await getTrainingDayContent("course", `day-${index}`);
    }
    await getTrainingDayContent("course", "day-0");

    expect(mockFindFirst).toHaveBeenCalledTimes(258);
  });

  it("invalidates a single day without flushing other cached days", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));
    await getTrainingDayContent("course", "day-a");
    await getTrainingDayContent("course", "day-b");

    invalidateTrainingDayContentCache("day-a");
    await getTrainingDayContent("course", "day-a");
    await getTrainingDayContent("course", "day-b");

    expect(mockFindFirst).toHaveBeenCalledTimes(3);
  });

  it("invalidates a course without flushing other cached courses", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockImplementation(({ where }) =>
      Promise.resolve(record(where.id === "day-a" ? "course-a" : "course-b", "Lesson")),
    );
    await getTrainingDayContent("course", "day-a");
    await getTrainingDayContent("course", "day-b");

    invalidateCourseContentCache("course-a");
    await getTrainingDayContent("course", "day-a");
    await getTrainingDayContent("course", "day-b");

    expect(mockFindFirst).toHaveBeenCalledTimes(3);
  });

  it("invalidates shared TrainingDay in every cached course but keeps unrelated days", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockImplementation(({ where }) =>
      Promise.resolve({
        ...record(where.id === "other-link" ? "other-course" : where.course.type, "Lesson"),
        day: {
          id: where.id === "other-link" ? "other-day" : "shared-day",
          title: "Lesson",
          stepLinks: [],
        },
      }),
    );
    await getTrainingDayContent("course-a", "shared-link-a");
    await getTrainingDayContent("course-b", "shared-link-b");
    await getTrainingDayContent("course-c", "other-link");

    invalidateTrainingDaysContentCache(["shared-day"]);
    await getTrainingDayContent("course-a", "shared-link-a");
    await getTrainingDayContent("course-b", "shared-link-b");
    await getTrainingDayContent("course-c", "other-link");

    expect(mockFindFirst).toHaveBeenCalledTimes(5);
  });

  it("invalidates a reused step across different days and courses", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockImplementation(({ where }) =>
      Promise.resolve({
        ...record(where.course.type, "Lesson"),
        day: {
          id: where.id,
          title: "Lesson",
          stepLinks: [{ step: { id: where.id === "other" ? "unrelated" : "shared-step" } }],
        },
      }),
    );
    await getTrainingDayContent("course-a", "day-a");
    await getTrainingDayContent("course-b", "day-b");
    await getTrainingDayContent("course-c", "other");

    invalidateStepsContentCache(["shared-step"]);
    await getTrainingDayContent("course-a", "day-a");
    await getTrainingDayContent("course-b", "day-b");
    await getTrainingDayContent("course-c", "other");

    expect(mockFindFirst).toHaveBeenCalledTimes(5);
  });

  it("does not evict cached lessons for an empty change set", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst.mockResolvedValue(record("course-1", "Lesson"));
    await getTrainingDayContent("course", "day-a");

    invalidateStepsContentCache([]);
    invalidateTrainingDaysContentCache([]);
    await getTrainingDayContent("course", "day-a");

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("cannot overwrite a newer entry with a stale in-flight result", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    let finish!: (value: ReturnType<typeof record>) => void;
    mockFindFirst
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue(record("course-1", "New"));

    const staleRequest = getTrainingDayContent("course", "day-link");
    await Promise.resolve();
    invalidateTrainingDayContentCache("day-link");

    const fresh = await getTrainingDayContent("course", "day-link");
    finish(record("course-1", "Old"));
    const old = await staleRequest;
    const again = await getTrainingDayContent("course", "day-link");

    expect(fresh?.day.title).toBe("New");
    expect(old?.day.title).toBe("Old");
    expect(again?.day.title).toBe("New");
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("flushes cached content when the feature flag is disabled at runtime", async () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    mockFindFirst
      .mockResolvedValueOnce(record("course-1", "Old"))
      .mockResolvedValueOnce(record("course-1", "New"))
      .mockResolvedValueOnce(record("course-1", "Newest"));

    await getTrainingDayContent("course", "day-link");
    process.env.ENABLE_COURSE_CACHE = "false";
    const live = await getTrainingDayContent("course", "day-link");
    process.env.ENABLE_COURSE_CACHE = "true";
    const enabledAgain = await getTrainingDayContent("course", "day-link");

    expect(live?.day.title).toBe("New");
    expect(enabledAgain?.day.title).toBe("Newest");
    expect(mockFindFirst).toHaveBeenCalledTimes(3);
  });
});
