import { beforeEach, describe, expect, it, vi } from "vitest";
const metrics = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("./trainingContentMetrics", () => ({ recordCourseCacheEvent: metrics.record }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
describe("durable PostgreSQL course revision is the cache authority", () => {
  it("without DB port returns null, never stale cache revision or 0", async () => {
    const core=await import("./trainingContentRevision");
    const warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
    await expect(core.getVerifiedCourseContentRevision()).resolves.toBeNull();
    expect(metrics.record).toHaveBeenCalledWith("dbRevisionFailure");
    warning.mockRestore();
  });
  it("reads a new PostgreSQL revision on every request, without Redis", async () => {
    const core=await import("./trainingContentRevision");
    const port={readDurableCourseContentRevision:vi.fn()
      .mockResolvedValueOnce("105").mockResolvedValueOnce("106")};
    core.registerCourseContentRevisionReadPort(port);
    await expect(core.getVerifiedCourseContentRevision()).resolves.toBe("105");
    await expect(core.getVerifiedCourseContentRevision()).resolves.toBe("106");
    expect(port.readDurableCourseContentRevision).toHaveBeenCalledTimes(2);
    expect(metrics.record).not.toHaveBeenCalledWith("redisReadFailure");
  });
  it("ignores a failed/missing PostgreSQL row and invalidates cached result", async () => {
    const core=await import("./trainingContentRevision");
    const port={readDurableCourseContentRevision:vi.fn()
      .mockRejectedValueOnce(new Error("DB_DOWN")).mockResolvedValueOnce(null)};
    core.registerCourseContentRevisionReadPort(port);
    const warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
    await expect(core.getVerifiedCourseContentRevision()).resolves.toBeNull();
    await expect(core.getVerifiedCourseContentRevision()).resolves.toBeNull();
    warning.mockRestore();
    expect(metrics.record).toHaveBeenCalledWith("dbRevisionFailure");
  });
  it("rejects replacing the database reader for an active process", async () => {
    const core=await import("./trainingContentRevision");
    const first={readDurableCourseContentRevision:vi.fn(async()=>"1")};
    core.registerCourseContentRevisionReadPort(first);
    core.registerCourseContentRevisionReadPort(first);
    expect(()=>core.registerCourseContentRevisionReadPort({readDurableCourseContentRevision:vi.fn()}))
      .toThrow("COURSE_CONTENT_REVISION_PORT_ALREADY_BOUND");
  });
});
