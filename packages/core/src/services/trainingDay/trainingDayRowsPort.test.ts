import { beforeEach, describe, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => ({ invalidate:vi.fn(), publish:vi.fn(async()=>{}) }));
vi.mock("../training/trainingDayContent",()=>({invalidateTrainingDaysContentCache:cache.invalidate}));
vi.mock("../training/trainingContentRevision",()=>({publishCourseContentChange:cache.publish}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),error:vi.fn(),warn:vi.fn()})}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
function adapter() {
  return {
    readTrainingDayForEdit:vi.fn(async()=>null),
    insertTrainingDay:vi.fn(async()=>({id:"day-new"})),
    replaceTrainingDay:vi.fn(async()=>({id:"day-updated"})),
    deleteTrainingDayRows:vi.fn(async()=>({courseIds:["course-A"],deletedDayIds:["day-A"]})),
    listVisibleTrainingDays:vi.fn(async()=>[]),
  };
}
const trainer={id:"trainer-A",role:"TRAINER" as const};
const draft={title:"Practice",authorId:"trainer-A",description:"",type:"regular",equipment:"",showCoursePathExport:false,shareProgressAcrossCourses:false,stepIds:["step-1"]};
describe("Trainer-day SQL owner-scoped port",()=>{
  it("cannot reveal or mutate trainer day without authoritative SQL port",async()=>{
    const svc=await import("./trainingDayService");
    await expect(svc.getTrainingDayForEdit("day-1",trainer))
      .rejects.toThrow("TRAINING_DAY_ROWS_PORT_UNBOUND");
    await expect(svc.createTrainingDay(draft,trainer))
      .resolves.toMatchObject({success:false,error:"TRAINING_DAY_ROWS_PORT_UNBOUND"});
    await expect(svc.getVisibleDays(trainer.id,false))
      .rejects.toThrow("TRAINING_DAY_ROWS_PORT_UNBOUND");
    expect(cache.publish).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
  it("forwards exact actor to SQL inside create/replace, then cache publish",async()=>{
    const svc=await import("./trainingDayService");const p=await import("./trainingDayRowsPort");
    const db=adapter();const fixtureTrainingDayRowsPort = db;
    await expect(svc.createTrainingDay(draft,trainer, fixtureTrainingDayRowsPort)).resolves.toEqual({success:true,dayId:"day-new"});
    expect(db.insertTrainingDay).toHaveBeenCalledExactlyOnceWith(draft,trainer);
    const updated={...draft,id:"day-A"};
    await expect(svc.updateTrainingDay(updated,trainer, fixtureTrainingDayRowsPort)).resolves.toMatchObject({success:true});
    expect(db.replaceTrainingDay).toHaveBeenCalledExactlyOnceWith(updated,trainer);
    expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith(["day-A"]);
    expect(cache.publish).toHaveBeenCalledTimes(1);
  });

});
