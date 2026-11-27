import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ point: vi.fn(), report: vi.fn() }));
vi.mock("./walkGpsStorage", () => ({ hasStoredGpsPoint: m.point }));
vi.mock("@/shared/lib/error-reporting", () => ({ reportClientErrorAndWait: m.report }));
import { reportCompletedWalkGps } from "./walkGpsCompletionDiagnostics";
import type { DogWalk } from "./walkModel";

const walk: DogWalk = {
  clientId: "synthetic-walk", startedAtMs: 1000, finishedAtMs: 121000,
  steps: 20, incompleteSteps: false, gpsEnabled: true, gpsMeters: null,
};
beforeEach(() => { vi.resetAllMocks(); m.point.mockResolvedValue(false); });
describe("GPS completion diagnostics", () => {
  it("reports no stored points for the completed GPS-enabled owner, without identifiers", async () => {
    await reportCompletedWalkGps("synthetic-owner", walk, () => true);
    expect(m.point).toHaveBeenCalledExactlyOnceWith("synthetic-owner", "synthetic-walk");
    expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {issueKey:"DogWalkGpsNoPoints"});
    expect(m.report.mock.calls[0][0].message).toBe("GPS_WALK_NO_POINTS");
  });
  it("separates insufficient fixes from a valid stationary zero-distance walk", async () => {
    m.point.mockResolvedValue(true);
    await reportCompletedWalkGps("owner", {...walk, gpsMeters: 0}, () => true);
    expect(m.report).not.toHaveBeenCalled();
    await reportCompletedWalkGps("owner", walk, () => true);
    expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {issueKey:"DogWalkGpsInsufficientFix"});
  });
  it("does not query a disabled, short, unfinished, paused-too-long or stale-owner walk", async () => {
    for (const value of [{...walk,gpsEnabled:false},{...walk,finishedAtMs:120999},
      {...walk,finishedAtMs:null},{...walk,elapsedBeforePauseMs:5000,runningSinceMs:null},
      {...walk,clientId:undefined}]) await reportCompletedWalkGps("owner",value,()=>true);
    await reportCompletedWalkGps("owner",walk,()=>false);
    expect(m.point).not.toHaveBeenCalled();
    expect(m.report).not.toHaveBeenCalled();
  });
  it("rechecks owner after the asynchronous point probe", async () => {
    const current = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await reportCompletedWalkGps("owner",walk,current);
    expect(current).toHaveBeenCalledTimes(2);
    expect(m.report).not.toHaveBeenCalled();
  });
  it("reports storage failure separately, never classifies unknown as missing", async () => {
    m.point.mockRejectedValue(new Error("private database detail"));
    await reportCompletedWalkGps("owner",walk,()=>true);
    expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {issueKey:"DogWalkGpsStorageUnavailable"});
    expect(m.report.mock.calls[0][0].message).toBe("GPS_WALK_STORAGE_UNAVAILABLE");
  });
});
