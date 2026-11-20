import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingContentReadPorts } from "./trainingDayContent";
const prior = {
  cache: process.env.ENABLE_COURSE_CACHE,
  sync: process.env.COURSE_CACHE_SYNC_ENABLED,
  redis: process.env.REDIS_URL,
};
const restore = (name: keyof typeof prior, env: string) => {
  if (prior[name] === undefined) delete process.env[env];
  else process.env[env] = prior[name];
};
const makeSnapshot = (title: string) => ({
  id: "course-day-A", courseId: "course-A", order: 0,
  course: { duration: "10", isPersonalized: false },
  day: {
    id: "day-A", title, description: "", type: "training",
    showCoursePathExport: false, stepLinks: [],
  },
});
function pair(title: string, revision: string) {
  const contentRows = { readTrainingDayContent: vi.fn(async () => makeSnapshot(title)) };
  const revisionRows = { readDurableCourseContentRevision: vi.fn(async () => revision) };
  return { ports: { contentRows, revisionRows } satisfies TrainingContentReadPorts,
    contentRows, revisionRows };
}
beforeEach(() => {
  vi.resetModules();
  process.env.ENABLE_COURSE_CACHE = "true";
  process.env.COURSE_CACHE_SYNC_ENABLED = "true";
  process.env.REDIS_URL = "redis://127.0.0.1:1";
});
afterEach(() => {
  restore("cache", "ENABLE_COURSE_CACHE");
  restore("sync", "COURSE_CACHE_SYNC_ENABLED");
  restore("redis", "REDIS_URL");
  vi.restoreAllMocks();
});

describe("explicit training content + revision SQL composition", () => {
  it("isolates same course/day/revision keys across independent injected adapters", async () => {
    const { getTrainingDayContent } = await import("./trainingDayContent");
    const a = pair("First instance", "25");
    const b = pair("Second instance", "25");
    expect((await getTrainingDayContent("type", "occurrence", a.ports))?.day.title)
      .toBe("First instance");
    expect((await getTrainingDayContent("type", "occurrence", b.ports))?.day.title)
      .toBe("Second instance");
    expect((await getTrainingDayContent("type", "occurrence", a.ports))?.day.title)
      .toBe("First instance");
    expect(a.contentRows.readTrainingDayContent)
      .toHaveBeenCalledExactlyOnceWith("type", "occurrence");
    expect(b.contentRows.readTrainingDayContent)
      .toHaveBeenCalledExactlyOnceWith("type", "occurrence");
    expect(a.revisionRows.readDurableCourseContentRevision).toHaveBeenCalledTimes(2);
    expect(b.revisionRows.readDurableCourseContentRevision).toHaveBeenCalledTimes(1);
  });
  it("bypasses cache after a failed durable revision check instead of serving stale content", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getTrainingDayContent } = await import("./trainingDayContent");
    const p = pair("Old", "3");
    expect((await getTrainingDayContent("course", "day", p.ports))?.day.title).toBe("Old");
    p.contentRows.readTrainingDayContent.mockResolvedValue(makeSnapshot("New"));
    p.revisionRows.readDurableCourseContentRevision.mockRejectedValueOnce(Error("DB_UNAVAILABLE"));
    expect((await getTrainingDayContent("course", "day", p.ports))?.day.title).toBe("New");
    expect(p.contentRows.readTrainingDayContent).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });
  it("keeps exact SQL failure visible when the owner-neutral content row cannot be read", async () => {
    const { getTrainingDayContent } = await import("./trainingDayContent");
    const p = pair("Original", "2");
    p.contentRows.readTrainingDayContent.mockRejectedValueOnce(Error("ROW_READ_FAILED"));
    await expect(getTrainingDayContent("course", "day", p.ports))
      .rejects.toThrow("ROW_READ_FAILED");
    expect(p.contentRows.readTrainingDayContent).toHaveBeenCalledOnce();
  });
});
