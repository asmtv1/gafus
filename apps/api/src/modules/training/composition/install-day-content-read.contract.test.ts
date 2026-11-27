import { describe, expect, it, vi } from "vitest";
const query=vi.hoisted(()=>({read:vi.fn(async (_course:string,_day:string)=>null)}));
vi.mock("@gafus/course-read-server",()=>({readTrainingDayContent:query.read}));
vi.mock("@gafus/course-read-server/content-revision",()=>({readDurableCourseContentRevision:vi.fn(async()=>null)}));
describe("API content snapshot projection composition",()=>{
  it("passes exact course type and occurrence to SQL rather than trusting global Step IDs",async()=>{
    const { dayContentReadPort } = await import("./training-content-rows-instance");
    const c=await import("../../../../../../packages/core/src/services/training/trainingDayContent");
    await expect(c.loadTrainingDayContent("type-B","occurrence-C",dayContentReadPort)).resolves.toBeNull();
    expect(query.read).toHaveBeenCalledExactlyOnceWith("type-B","occurrence-C");
    await expect(c.loadTrainingDayContent("type-B","occurrence-C",undefined!)).rejects.toThrow("TRAINING_DAY_CONTENT_READ_PORT_UNBOUND");
  });
});
