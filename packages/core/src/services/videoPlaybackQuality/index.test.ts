import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({createMany:vi.fn(),query:vi.fn()}));
vi.mock("@gafus/prisma",() => ({prisma: {
  videoPlaybackQualityEvent:{createMany:f.createMany},$queryRaw:f.query,
}}));
import { getVideoPlaybackQualityReport, recordVideoPlaybackQuality } from "./index";

const event = {
  id:"8664167d-0459-47ec-aa50-f4c3e5b3f302",surface:"moments" as const,
  platform:"android" as const,quality:360 as const,mode:"auto" as const,
  available360:true,available720:true,networkClass:"wifi" as const,
  saveData:false,fallback:false,
};
beforeEach(() => {vi.clearAllMocks(); f.query.mockResolvedValue([]);});
describe("anonymous playback quality reporting",() => {
  it("persists a single exact client UUID with conflict deduplication",async()=>{
    await recordVideoPlaybackQuality(event);
    expect(f.createMany).toHaveBeenCalledExactlyOnceWith({
      data:[event],skipDuplicates:true,
    });
  });
  it("reports 360 and 720 starts, actual availability, by-day and segmented totals",async()=>{
    f.query.mockResolvedValue([
      {day:"2026-11-05",surface:"moments",platform:"android",quality:360,
        mode:"auto",networkClass:"cellular",saveData:true,starts:4,
        only360:2,only720:0,fallbackStarts:1},
      {day:"2026-11-05",surface:"moments",platform:"android",quality:720,
        mode:"auto",networkClass:"wifi",saveData:false,starts:6,
        only360:0,only720:2,fallbackStarts:0},
      {day:"2026-11-04",surface:"chat",platform:"web",quality:360,
        mode:"manual",networkClass:"unknown",saveData:false,starts:2,
        only360:0,only720:0,fallbackStarts:0},
      {day:"2026-11-04",surface:"chat",platform:"web",quality:720,
        mode:"auto",networkClass:"wifi",saveData:false,starts:8,
        only360:0,only720:0,fallbackStarts:0},
    ]);
    const report = await getVideoPlaybackQualityReport(7,new Date("2026-11-05T12:00:00Z"));
    expect(report).toMatchObject({
      days:7,from:"2026-10-30",through:"2026-11-05",
      total:20,count360:6,count720:14,percent360:30,
      auto360:4,manual360:2,only360:2,only720:2,
      fallbackStarts:1,savingData360:4,
    });
    expect(report.byDay).toHaveLength(7);
    expect(report.byDay[5]).toMatchObject({label:"2026-11-04",count360:2,count720:8,total:10});
    expect(report.bySurface).toEqual([
      {label:"chat",count360:2,count720:8,total:10},
      {label:"moments",count360:4,count720:6,total:10},
    ]);
    expect(report.byPlatform.map(row=>row.label)).toEqual(["android","web"]);
  });
  it("returns no phantom percentages before first events arrive",async()=>{
    const data=await getVideoPlaybackQualityReport(30,new Date("2026-11-05T12:00:00Z"));
    expect(data).toMatchObject({total:0,count360:0,count720:0,percent360:0,only360:0});
    expect(data.byDay).toHaveLength(30);
  });
});
