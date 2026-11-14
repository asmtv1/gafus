import { beforeEach, describe, expect, it, vi } from "vitest";

const sideEffects = vi.hoisted(() => ({ invalidate: vi.fn(), publish: vi.fn() }));
vi.mock("../training/trainingDayContent", () => ({ invalidateCourseContentCache: sideEffects.invalidate }));
vi.mock("../training/trainingContentRevision", () => ({ publishCourseContentChange: sideEffects.publish }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() }),
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); sideEffects.publish.mockResolvedValue(undefined); });

const actor = { id: "trainer-A", role: "TRAINER" };
function adapter() {
  return {
    readCourseVersionRows: vi.fn(async () => [{ id: "course-A", name: "old", version: 1 }]),
    writeCourseNameVersionRows: vi.fn(async () => [{ id: "course-A", name: "new", version: 2 }]),
    setCourseLogoVersionRows: vi.fn(async () => ({
      status: "updated" as const, data: { version: 2, previousLogoUrl: "https://old.invalid/logo" },
    })),
  };
}

describe("Course.version Persistence port preserves CAS and results", () => {
  it("fails closed as existing UNKNOWN for valid requests without SQL binding", async () => {
    const c = await import("./courseVersionService");
    await expect(c.readCourseNameVersion("course-A", actor)).resolves.toEqual({ status: "unknown" });
    await expect(c.updateCourseNameVersioned({ courseId: "course-A", name: "new", expectedVersion: 1 }, actor))
      .resolves.toEqual({ status: "unknown" });
    await expect(c.setCourseLogoVersioned({ courseId: "course-A", logoUrl: "https://new.invalid/logo", expectedVersion: 1 }, actor))
      .resolves.toEqual({ status: "unknown" });
    expect(sideEffects.invalidate).not.toHaveBeenCalled();
    expect(sideEffects.publish).not.toHaveBeenCalled();
  });
  it("preserves existing INVALID responses before touching SQL", async () => {
    const c = await import("./courseVersionService");
    await expect(c.readCourseNameVersion("invalid space", actor)).resolves.toEqual({ status: "invalid" });
    await expect(c.updateCourseNameVersioned({ courseId: "course-A", name: "new", expectedVersion: 0 }, actor))
      .resolves.toEqual({ status: "invalid" });
    await expect(c.setCourseLogoVersioned({ courseId: "course-A", logoUrl: "x", expectedVersion: 1 },
      { id: "stranger", role: "USER" })).resolves.toEqual({ status: "invalid" });
  });
  it("forwards owner/version exactly and publishes only a verified successful commit", async () => {
    const c = await import("./courseVersionService");
    const p = adapter();
    c.registerCourseVersionRowsPort(p);
    await expect(c.readCourseNameVersion("course-A", actor)).resolves.toEqual({
      status: "found", data: { id: "course-A", name: "old", version: 1 },
    });
    expect(p.readCourseVersionRows).toHaveBeenCalledWith("course-A", actor);
    await expect(c.updateCourseNameVersioned({ courseId: "course-A", name: "new", expectedVersion: 1 }, actor))
      .resolves.toEqual({ status: "updated", data: { id: "course-A", name: "new", version: 2 } });
    expect(p.writeCourseNameVersionRows).toHaveBeenCalledWith(
      { courseId: "course-A", name: "new", expectedVersion: 1 }, actor,
    );
    expect(sideEffects.invalidate).toHaveBeenCalledExactlyOnceWith("course-A");
    expect(sideEffects.publish).toHaveBeenCalledTimes(1);
    await expect(c.setCourseLogoVersioned({ courseId: "course-A", logoUrl: "new", expectedVersion: 1 }, actor))
      .resolves.toEqual({ status: "updated", data: { version: 2, previousLogoUrl: "https://old.invalid/logo" } });
    expect(p.setCourseLogoVersionRows).toHaveBeenCalledWith(
      { courseId: "course-A", logoUrl: "new", expectedVersion: 1 }, actor,
    );
  });
  it("does not publish or retry an ambiguous CAS or permit adapter rebinding", async () => {
    const c = await import("./courseVersionService");
    const p = adapter();
    p.writeCourseNameVersionRows.mockResolvedValueOnce([]);
    p.readCourseVersionRows.mockResolvedValueOnce([]);
    c.registerCourseVersionRowsPort(p);
    c.registerCourseVersionRowsPort(p);
    expect(() => c.registerCourseVersionRowsPort(adapter())).toThrow("COURSE_VERSION_PORT_ALREADY_BOUND");
    await expect(c.updateCourseNameVersioned({ courseId: "course-A", name: "new", expectedVersion: 1 }, actor))
      .resolves.toEqual({ status: "not_found" });
    expect(p.writeCourseNameVersionRows).toHaveBeenCalledTimes(1);
    expect(sideEffects.publish).not.toHaveBeenCalled();
  });
});
