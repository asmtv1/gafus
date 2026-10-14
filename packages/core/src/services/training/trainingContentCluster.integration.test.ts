/**
 * Two simulated independent Node.js caches checking one committed PostgreSQL revision.
 * No database, Redis instance or production credentials are used.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({
  revision: "0" as string | null,
  title: "Original",
  dbRead: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    dayOnCourse: {
      findFirst: (...args: unknown[]) => shared.dbRead(...args),
    },
  },
}));

vi.mock("./trainingContentRevision", () => ({
  courseContentSyncEnabled: () => true,
  getVerifiedCourseContentRevision: async () => shared.revision,
}));

const previousFlag = process.env.ENABLE_COURSE_CACHE;

async function createProcessCache() {
  vi.resetModules();
  const module = await import("./trainingDayContent");
  return module.getTrainingDayContent;
}

describe("multi-process course content contract (simulated committed DB revision)", () => {
  beforeEach(() => {
    process.env.ENABLE_COURSE_CACHE = "true";
    shared.revision = "0";
    shared.title = "Original";
    shared.dbRead.mockReset().mockImplementation(() =>
      Promise.resolve({
        id: "course-day",
        courseId: "course-1",
        course: { duration: "7", isPersonalized: false },
        day: { id: "training-day", title: shared.title, stepLinks: [] },
      }),
    );
  });

  afterEach(() => {
    vi.resetModules();
    if (previousFlag === undefined) delete process.env.ENABLE_COURSE_CACHE;
    else process.env.ENABLE_COURSE_CACHE = previousFlag;
  });

  it("sees a committed course edit immediately in both readers without Redis GET", async () => {
    const web = await createProcessCache();
    const api = await createProcessCache();

    expect((await web("course", "course-day"))?.day.title).toBe("Original");
    expect((await api("course", "course-day"))?.day.title).toBe("Original");
    expect(shared.dbRead).toHaveBeenCalledTimes(2);

    shared.title = "Updated";
    shared.revision = "1";

    expect((await web("course", "course-day"))?.day.title).toBe("Updated");
    expect((await api("course", "course-day"))?.day.title).toBe("Updated");
    expect(shared.dbRead).toHaveBeenCalledTimes(4);

    // Both independently populated caches are now hot again.
    await web("course", "course-day");
    await api("course", "course-day");
    expect(shared.dbRead).toHaveBeenCalledTimes(4);
  });

  it("fails closed while database revision probe is down, then refreshes on recovery", async () => {
    const web = await createProcessCache();
    const api = await createProcessCache();
    await web("course", "course-day");
    await api("course", "course-day");

    shared.title = "Edited while Redis unavailable";
    shared.revision = null;
    expect((await web("course", "course-day"))?.day.title).toBe(shared.title);
    expect((await api("course", "course-day"))?.day.title).toBe(shared.title);

    shared.revision = "2";
    expect((await web("course", "course-day"))?.day.title).toBe(shared.title);
    expect((await api("course", "course-day"))?.day.title).toBe(shared.title);
    expect(shared.dbRead).toHaveBeenCalledTimes(6);
  });
});
