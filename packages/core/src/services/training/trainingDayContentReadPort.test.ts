import { beforeEach, describe, expect, it, vi } from "vitest";
const events=vi.hoisted(()=>({error:vi.fn(),observe:vi.fn()}));
vi.mock("./trainingContentMetrics",()=>({
  recordCourseCacheEvent:events.error,
  observeCourseContentDbRead:events.observe,
}));
vi.mock("./trainingContentRevision",()=>({
  courseContentSyncEnabled:vi.fn(()=>false),
  getVerifiedCourseContentRevision:vi.fn(async()=>"3"),
}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
function stub() {
  return {readTrainingDayContent:vi.fn(async (_course:string,_day:string)=>({
    id:"link-1",courseId:"course-1",order:1,
    course:{duration:"30",isPersonalized:false},
    day:{id:"day-1",title:"Read-only",description:"",type:"training",showCoursePathExport:false,stepLinks:[]},
  }))};
}
describe("exact course/day owner-neutral content read port",()=>{
  it("without SQL adapter denies read rather than returning cached or empty content",async()=>{
    const c=await import("./trainingDayContent");
    await expect(c.loadTrainingDayContent("course-type","day-1"))
      .rejects.toThrow("TRAINING_DAY_CONTENT_READ_PORT_UNBOUND");
    expect(events.error).toHaveBeenCalledWith("dbError");
  });
  it("preserves exact courseType and occurrence ID across DB boundary",async()=>{
    const c=await import("./trainingDayContent");const p=await import("./trainingDayContentReadPort");
    const port=stub();p.registerTrainingDayContentReadPort(port);
    await expect(c.loadTrainingDayContent("chosen-course","day-link-1"))
      .resolves.toMatchObject({id:"link-1",courseId:"course-1",day:{id:"day-1"}});
    expect(port.readTrainingDayContent).toHaveBeenCalledExactlyOnceWith("chosen-course","day-link-1");
    expect(events.observe).toHaveBeenCalledOnce();
  });
  it("does not convert database error or missing day into an authorization success",async()=>{
    const c=await import("./trainingDayContent");const p=await import("./trainingDayContentReadPort");
    const port={readTrainingDayContent:vi.fn().mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("DB_DOWN"))};
    p.registerTrainingDayContentReadPort(port);
    await expect(c.loadTrainingDayContent("training","missing-day")).resolves.toBeNull();
    await expect(c.loadTrainingDayContent("training","existing-day")).rejects.toThrow("DB_DOWN");
    expect(events.error).toHaveBeenCalledWith("dbError");
  });
  it("rejects hot-replacing a DB reader",async()=>{
    const p=await import("./trainingDayContentReadPort");const port=stub();
    p.registerTrainingDayContentReadPort(port);p.registerTrainingDayContentReadPort(port);
    expect(()=>p.registerTrainingDayContentReadPort(stub()))
      .toThrow("TRAINING_DAY_CONTENT_READ_PORT_ALREADY_BOUND");
  });
});
