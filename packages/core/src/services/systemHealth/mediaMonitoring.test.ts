import { beforeEach, describe, expect, it, vi } from "vitest";

const m=vi.hoisted(()=>({
  multi: {
    hincrby: vi.fn(), expire: vi.fn(), exec: vi.fn(),
  },
  pipeline:vi.fn(),get:vi.fn(),prisma:{
    galleryUpload:{count:vi.fn(),findMany:vi.fn(),findFirst:vi.fn()},
    galleryStorageJob:{count:vi.fn(),findFirst:vi.fn()},
    feedStorageJob:{count:vi.fn(),findMany:vi.fn(),findFirst:vi.fn()},
    questionPhoto:{count:vi.fn()},
  },
}));
m.multi.hincrby.mockReturnValue(m.multi);
m.multi.expire.mockReturnValue(m.multi);
m.multi.exec.mockResolvedValue([]);
vi.mock("@gafus/prisma",()=>({prisma:m.prisma}));
vi.mock("@gafus/queues",()=>({
  connection:{multi:()=>m.multi,pipeline:m.pipeline,get:m.get},
}));
import { getAdminMediaDashboard, kindForCloudruJob, recordMediaDispatch,
  recordMediaEmptyClaim } from "./mediaMonitoring";

beforeEach(()=>{
  vi.clearAllMocks();
  for(const obj of Object.values(m.prisma))
    for(const [name,func] of Object.entries(obj))
      if(name==="count")func.mockResolvedValue(0);
      else if(name==="findMany")func.mockResolvedValue([]);
      else if(name==="findFirst")func.mockResolvedValue(null);
  m.multi.hincrby.mockReturnValue(m.multi);
  m.multi.expire.mockReturnValue(m.multi);
  m.multi.exec.mockResolvedValue([]);
  m.pipeline.mockReturnValue({exec:vi.fn().mockResolvedValue([])});
  m.get.mockResolvedValue(null);
});

describe("Cloud.ru privacy-safe metric aggregation",()=>{
  it("maps only allowlisted Jobs, including both Feed replicas",()=>{
    expect(kindForCloudruJob("gafus-gallery-process")).toBe("gallery");
    expect(kindForCloudruJob("gafus-questions-photo")).toBe("questions");
    expect(kindForCloudruJob("gafus-feed-photo-2")).toBe("feed-photo");
    expect(kindForCloudruJob("gafus-feed-video-2")).toBe("feed-video");
    expect(kindForCloudruJob("../../token")).toBe(null);
  });
  it("records HTTP 499, 429, 5xx and transport timeouts, not private data",async()=>{
    const now=new Date("2026-10-19T16:25:00Z");
    await recordMediaDispatch("gafus-gallery-process",499,7250,undefined,now);
    await recordMediaDispatch("gafus-feed-photo",429,2000,undefined,now);
    await recordMediaDispatch("gafus-feed-video-2",503,2500,undefined,now);
    await recordMediaDispatch("gafus-feed-video",undefined,18001,"timeout",now);
    expect(m.multi.hincrby.mock.calls.map(([key,field,val])=>[field,val]))
      .toEqual(expect.arrayContaining([
        ["gallery:499",1],["feed-photo:429",1],
        ["feed-video:5xx",1],["feed-video:timeout",1],
      ]));
    const keys=m.multi.hincrby.mock.calls.map(([key])=>key);
    expect(keys.every(key=>key==="gafus:media:monitor:v1:2026-10-19T16")).toBe(true);
    await recordMediaDispatch("s3.cloud.ru/private/secret",499,20);
    expect(m.multi.exec).toHaveBeenCalledTimes(4);
    await recordMediaEmptyClaim("feed-photo",now);
    expect(m.multi.hincrby).toHaveBeenCalledWith(
      "gafus:media:monitor:v1:2026-10-19T16","feed-photo:empty",1);
  });
  it("reads DB queues without exposing uploads and labels Redis loss unavailable",async()=>{
    m.pipeline.mockReturnValue({exec:vi.fn().mockRejectedValue(Error("REDIS_DOWN"))});
    const data=await getAdminMediaDashboard(new Date("2026-10-19T16:00:00Z"));
    expect(data.telemetryAvailable).toBe(false);
    expect(data.rows).toHaveLength(4);
    expect(data.rows[0]?.launches24h).toBeNull();
    expect(data.rows[2]?.errors).toBeNull();
    expect(data.attention).toEqual([]);
  });
  it("signals stalled DB queue and exposes end-to-end timings, not process CPU",async()=>{
    const current=new Date("2026-10-19T16:00:00Z");
    m.prisma.feedStorageJob.count.mockImplementation(async({where}:{where:{kind?:unknown;status?:unknown;OR?:unknown}})=>{
      if(where.kind==="publish_video"&&where.status==="pending")return 2;
      if(where.kind==="publish_video"&&where.OR)return 1;
      return 0;
    });
    m.prisma.feedStorageJob.findFirst.mockImplementation(async({where}:{where:{kind?:unknown;status?:unknown;OR?:unknown}})=>
      where.kind==="publish_video"
        ? {createdAt:new Date("2026-10-19T15:30:00Z")}:null);
    m.prisma.feedStorageJob.findMany.mockImplementation(async({where}:{where:{kind?:unknown;status?:unknown;OR?:unknown}})=>
      where.kind==="publish_video" ? [
        {createdAt:new Date("2026-10-19T15:00:00Z"),updatedAt:new Date("2026-10-19T15:02:00Z")},
        {createdAt:new Date("2026-10-19T15:01:00Z"),updatedAt:new Date("2026-10-19T15:05:00Z")},
      ]:[]);
    const data=await getAdminMediaDashboard(current);
    expect(data.attention).toContain("feed-video");
    const row=data.rows.find(r=>r.kind==="feed-video")!;
    expect(row.stuck).toBe(1);
    expect(row.averageEndToEndMs).toBe(180000);
    expect(row.maxEndToEndMs).toBe(240000);
    expect(row.oldestPendingMinutes).toBe(30);
  });
});
