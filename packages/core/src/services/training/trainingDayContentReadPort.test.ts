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
    await expect(c.loadTrainingDayContent("course-type","day-1",undefined!))
      .rejects.toThrow("TRAINING_DAY_CONTENT_READ_PORT_UNBOUND");
    expect(events.error).toHaveBeenCalledWith("dbError");
  });
  it("preserves exact courseType and occurrence ID across DB boundary",async()=>{
    const c=await import("./trainingDayContent");
    const port=stub();
    await expect(c.loadTrainingDayContent("chosen-course","day-link-1",port))
      .resolves.toMatchObject({id:"link-1",courseId:"course-1",day:{id:"day-1"}});
    expect(port.readTrainingDayContent).toHaveBeenCalledExactlyOnceWith("chosen-course","day-link-1");
    expect(events.observe).toHaveBeenCalledOnce();
  });
  it("does not convert database error or missing day into an authorization success",async()=>{
    const c=await import("./trainingDayContent");
    const port={readTrainingDayContent:vi.fn().mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("DB_DOWN"))};
    await expect(c.loadTrainingDayContent("training","missing-day",port)).resolves.toBeNull();
    await expect(c.loadTrainingDayContent("training","existing-day",port)).rejects.toThrow("DB_DOWN");
    expect(events.error).toHaveBeenCalledWith("dbError");
  });
  it("isolates independent SQL readers",async()=>{
    const c=await import("./trainingDayContent");
    const a=stub(),b=stub();
    await Promise.all([c.loadTrainingDayContent("a","x",a),c.loadTrainingDayContent("b","y",b)]);
    expect(a.readTrainingDayContent).toHaveBeenCalledWith("a","x");
    expect(b.readTrainingDayContent).toHaveBeenCalledWith("b","y");
  });
});
