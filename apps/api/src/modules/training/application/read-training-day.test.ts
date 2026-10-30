import { describe, expect, it, vi } from "vitest";
import { createReadTrainingDayApplication } from "./read-training-day";

const cmd = {
  actorUserId: "owner-A",
  courseType: "not_selection",
  dayOnCourseId: "clwdayoc0000000000000001",
  options: { createIfMissing: false, platform: "IOS" as const },
};

describe("AG1-001 training-day missing result application orchestration", () => {
  it("day exists: exact owner/options once; preserve Core DTO identity, no extra access read", async () => {
    const trace: string[] = [];
    const day = { trainingDayId: "day-one", steps: [{
      id:"locked", locked:true, description:"",
      monetizationTarget:{targetType:"COURSE_STEP",targetId:"link-one"},
    }] };
    const readDay = vi.fn(async () => { trace.push("day"); return day as never; });
    const checkAccess = vi.fn();
    const app = createReadTrainingDayApplication({ readDay, checkAccess });
    const got = await app.execute(cmd);
    expect(readDay).toHaveBeenCalledExactlyOnceWith(
      cmd.actorUserId,cmd.courseType,cmd.dayOnCourseId,cmd.options,
    );
    expect(trace).toEqual(["day"]);
    expect(checkAccess).not.toHaveBeenCalled();
    expect(got).toEqual({ kind:"found", detail:day });
    expect(got.kind==="found" && got.detail===day).toBe(true);
  });
  it.each([
    [false,"forbidden"],[true,"not_found"],
  ] as const)("day missing and hasAccess=%s becomes %s after exact owner access read", async (
    allowed,expected,
  ) => {
    const trace:string[]=[];
    const readDay=vi.fn(async()=>{
      trace.push("day");return null;
    });
    const checkAccess=vi.fn(async(type:string,actor?:string)=>{
      trace.push("access:"+type+":"+actor);
      return {hasAccess:allowed};
    });
    const app=createReadTrainingDayApplication({readDay,checkAccess});
    expect(await app.execute(cmd)).toEqual({kind:expected});
    expect(trace).toEqual(["day","access:not_selection:owner-A"]);
    expect(readDay).toHaveBeenCalledExactlyOnceWith(
      cmd.actorUserId,cmd.courseType,cmd.dayOnCourseId,cmd.options,
    );
    expect(checkAccess).toHaveBeenCalledExactlyOnceWith(
      cmd.courseType,cmd.actorUserId,
    );
  });
  it("unexpected undefined from a legacy Core boundary follows original falsy fallback", async () => {
    const readDay=vi.fn().mockResolvedValue(undefined);
    const checkAccess=vi.fn().mockResolvedValue({hasAccess:true});
    expect(await createReadTrainingDayApplication({
      readDay,checkAccess,
    }).execute(cmd)).toEqual({kind:"not_found"});
    expect(readDay).toHaveBeenCalledOnce();
    expect(checkAccess).toHaveBeenCalledExactlyOnceWith(
      cmd.courseType,cmd.actorUserId,
    );
  });
  it("preserves opted-in createIfMissing/platform values; never invents a write", async () => {
    const readDay=vi.fn().mockResolvedValue(null);
    const checkAccess=vi.fn().mockResolvedValue({hasAccess:false});
    const request={...cmd,options:{createIfMissing:true,platform:"ANDROID" as const}};
    expect(await createReadTrainingDayApplication({
      readDay,checkAccess,
    }).execute(request)).toEqual({kind:"forbidden"});
    expect(readDay).toHaveBeenCalledExactlyOnceWith(
      request.actorUserId,request.courseType,request.dayOnCourseId,request.options,
    );
    expect(checkAccess).toHaveBeenCalledExactlyOnceWith(
      request.courseType,request.actorUserId,
    );
  });
  it("day Core failure is untouched, no second Core call", async () => {
    const err = new Error("PERSONALIZATION_REQUIRED");
    const readDay=vi.fn().mockRejectedValue(err);
    const checkAccess=vi.fn();
    await expect(createReadTrainingDayApplication({
      readDay,checkAccess,
    }).execute(cmd)).rejects.toBe(err);
    expect(readDay).toHaveBeenCalledOnce();
    expect(checkAccess).not.toHaveBeenCalled();
  });
  it("access Core failure is untouched and never retries day read", async () => {
    const err=new Error("SYNTHETIC_ACCESS_DB_FAULT");
    const readDay=vi.fn().mockResolvedValue(null);
    const checkAccess=vi.fn().mockRejectedValue(err);
    await expect(createReadTrainingDayApplication({
      readDay,checkAccess,
    }).execute(cmd)).rejects.toBe(err);
    expect(readDay).toHaveBeenCalledOnce();
    expect(checkAccess).toHaveBeenCalledOnce();
  });
});
