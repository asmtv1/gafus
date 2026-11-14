import { describe, expect, it, vi } from "vitest";
const query=vi.hoisted(()=>({ durable:vi.fn(async()=>"875") }));
vi.mock("@gafus/course-read-server/content-revision",()=>({
  readDurableCourseContentRevision:query.durable,
}));
describe("API authoritative course revision composition",()=>{
  it("reads PostgreSQL on every verification without Redis or fallback to revision zero",async()=>{
    const core=await import("@gafus/core/services/training");
    await import("./install-content-revision-read");
    await expect(core.getVerifiedCourseContentRevision()).resolves.toBe("875");
    await expect(core.getVerifiedCourseContentRevision()).resolves.toBe("875");
    expect(query.durable).toHaveBeenCalledTimes(2);
  });
});
