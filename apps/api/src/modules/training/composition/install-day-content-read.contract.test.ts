import { describe, expect, it, vi } from "vitest";
const query=vi.hoisted(()=>({read:vi.fn(async (_course:string,_day:string)=>null)}));
vi.mock("@gafus/course-read-server",()=>({readTrainingDayContent:query.read}));
describe("API content snapshot projection composition",()=>{
  it("passes exact course type and occurrence to SQL rather than trusting global Step IDs",async()=>{
    const port=await import("@gafus/core/services/training");
    await import("./install-day-content-read");
    const c=await import("../../../../../../packages/core/src/services/training/trainingDayContent");
    await expect(c.loadTrainingDayContent("type-B","occurrence-C")).resolves.toBeNull();
    expect(query.read).toHaveBeenCalledExactlyOnceWith("type-B","occurrence-C");
    expect(()=>port.registerTrainingDayContentReadPort({readTrainingDayContent:vi.fn()}))
      .toThrow("TRAINING_DAY_CONTENT_READ_PORT_ALREADY_BOUND");
  });
});
