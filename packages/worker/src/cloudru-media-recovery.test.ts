import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  galleryJobs: vi.fn(), galleryUploads: vi.fn(), galleryJobCount: vi.fn(),
  galleryUploadCount: vi.fn(), feedJobs: vi.fn(), feedJobCount: vi.fn(),
  questionsKeys: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    galleryStorageJob: { findMany: db.galleryJobs, count: db.galleryJobCount },
    galleryUpload: { findMany: db.galleryUploads, count: db.galleryUploadCount },
    feedStorageJob: { findMany: db.feedJobs, count: db.feedJobCount },
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  listPendingQuestionCloudWorkKeys: db.questionsKeys,
}));
import {
  createCloudruMediaRecovery, enabledRecoveryKind, hasDueCloudruWork,
  inspectDueCloudruWork, type RecoveryKind, type RecoverySnapshot,
} from "./cloudru-media-recovery";

const env = {
  CLOUDRU_MEDIA_JOBS_ENABLED: "true",
  CLOUDRU_PROJECT_ID: "12345678-1234-1234-1234-123456789012",
  CLOUDRU_KEY_ID: "test-key", CLOUDRU_KEY_SECRET: "test-secret",
  GALLERY_PROCESSOR_READY: "true", FEED_PROCESSOR_READY: "true",
  QUESTIONS_PROCESSOR_READY: "true", QUESTIONS_CLOUD_JOB_ENABLED: "true",
  QUESTIONS_PUBLIC_S3_ENABLED: "true",
};
const empty = (): RecoverySnapshot => ({dueIds: [], active: 0});
const video = (n: number): RecoverySnapshot =>
  ({dueIds: Array.from({length:n}, (_,i)=>"video-"+i), active:0});
const noWait = async (_ms: number) => {};

beforeEach(() => {
  vi.clearAllMocks();
  for(const f of [db.galleryJobs, db.galleryUploads, db.feedJobs]) f.mockResolvedValue([]);
  for(const f of [db.galleryJobCount, db.galleryUploadCount, db.feedJobCount])
    f.mockResolvedValue(0);
  db.questionsKeys.mockResolvedValue([]);
});

describe("every-minute, bounded demand-driven Cloud.ru recovery", () => {
  it("inspects four queues and NEVER launches Cloud.ru Jobs for empty work", async () => {
    const inspect=vi.fn(async (_kind:RecoveryKind)=>empty());
    const dispatch=vi.fn();
    const recover=createCloudruMediaRecovery({env,inspect,dispatch,pause:noWait});
    expect(await recover()).toEqual({dispatched:0});
    expect(inspect.mock.calls.map(([kind])=>kind)).toEqual([
      "gallery","feed-photo","feed-video","questions",
    ]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("only launches the media kind that has runnable work", async () => {
    const dispatch=vi.fn(async (_kind:RecoveryKind)=>({dispatched:1}));
    const inspect=vi.fn(async (kind:RecoveryKind)=>
      kind==="feed-video" ? video(1) : empty());
    const recover=createCloudruMediaRecovery({env,inspect,dispatch,pause:noWait});
    expect(await recover()).toEqual({dispatched:1});
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith("feed-video");
  });

  it("drains a short video backlog, stopping immediately when it becomes empty", async () => {
    let pending=["v1","v2","v3"];
    const inspect=vi.fn(async (kind:RecoveryKind)=>
      kind==="feed-video"?{dueIds:[...pending],active:0}:empty());
    const dispatch=vi.fn(async (kind:RecoveryKind)=>{
      expect(kind).toBe("feed-video");
      pending=pending.slice(1);
      return {dispatched:1};
    });
    const recover=createCloudruMediaRecovery({env,inspect,dispatch,pause:noWait});
    expect(await recover()).toEqual({dispatched:3});
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(pending).toEqual([]);
    expect(inspect.mock.calls.filter(([kind])=>kind==="feed-video").length).toBeLessThan(8);
  });

  it("batch-limits 30 due videos to four recovery starts per tick, never exceeding two replicas", async () => {
    const ids=Array.from({length:30}, (_,n)=>"v"+n);
    let inFlight=0,maxFlight=0;
    const dispatch=vi.fn(async (kind:RecoveryKind)=>{
      expect(kind).toBe("feed-video");
      inFlight++;maxFlight=Math.max(maxFlight,inFlight);
      await Promise.resolve(); // both replica executions can run concurrently
      ids.shift();inFlight--;
      return {dispatched:1};
    });
    const recover=createCloudruMediaRecovery({
      env, inspect:async kind=>kind==="feed-video"
        ? {dueIds:[...ids],active:0}:empty(),
      dispatch,pause:noWait,
    });
    expect(await recover()).toEqual({dispatched:4});
    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(maxFlight).toBeLessThanOrEqual(2);
    expect(ids).toHaveLength(26);
  });

  it("holds accepted but unclaimed launches instead of starting paid duplicates", async () => {
    const dispatch=vi.fn(async()=>({dispatched:1}));
    let tick=0;
    const recover=createCloudruMediaRecovery({env,
      now:()=>tick, pause:noWait,
      inspect:async kind=>kind==="feed-video"?video(30):empty(),
      dispatch,
    });
    expect(await recover()).toEqual({dispatched:2});
    expect(dispatch).toHaveBeenCalledTimes(2);
    tick+=60_000; // next minute, cloud jobs may still be cold-starting
    expect(await recover()).toEqual({dispatched:0});
    expect(dispatch).toHaveBeenCalledTimes(2);
    tick+=120_000; // never claimed: bounded recovery can eventually try again
    expect(await recover()).toEqual({dispatched:2});
    expect(dispatch).toHaveBeenCalledTimes(4);
  });

  it("counts real DB leases as active and does not exceed video replica capacity", async () => {
    let active=2;
    const pending=["v1","v2","v3"];
    // Cloud.ru accepts the launch, but the second live DB lease has not
    // appeared yet. Recovery must reserve its place, not launch a duplicate.
    const dispatch=vi.fn(async()=>({dispatched:1}));
    const recover=createCloudruMediaRecovery({env,pause:noWait,
      inspect:async kind=>kind==="feed-video"
        ? {dueIds:[...pending],active}:empty(),
      dispatch,
    });
    expect(await recover()).toEqual({dispatched:0});
    active=1;
    expect(await recover()).toEqual({dispatched:1});
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("Gallery HTTP 499 never starves Feed photo/video or Questions", async () => {
    const errors=vi.fn();
    const dispatch=vi.fn(async(kind:RecoveryKind)=>{
      if(kind==="gallery") throw Error("499");
      return {dispatched:1};
    });
    const recover=createCloudruMediaRecovery({env,pause:noWait,
      inspect:async kind=>({dueIds:[kind],active:0}),
      dispatch,report:errors,
    });
    expect(await recover()).toEqual({dispatched:3});
    expect(errors).toHaveBeenCalledWith("gallery","execute");
    expect(dispatch.mock.calls.map(([kind])=>kind)).toEqual(expect.arrayContaining([
      "gallery","feed-photo","feed-video","questions",
    ]));
  });

  it("enforces two concurrent HTTP :execute calls globally across all kinds", async () => {
    let outstanding=0,peak=0;
    const dispatch=vi.fn(async(_kind:RecoveryKind)=>{
      outstanding++;peak=Math.max(peak,outstanding);
      await Promise.resolve();await Promise.resolve();
      outstanding--;
      return {dispatched:1};
    });
    const recover=createCloudruMediaRecovery({env,pause:noWait,dispatch,
      inspect:async kind=>({dueIds:[kind],active:0})});
    expect(await recover()).toEqual({dispatched:4});
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("backs off failed launch at 1, 2, 4 minutes, but still checks every minute", async () => {
    let tick=10_000;
    const inspect=vi.fn(async(kind:RecoveryKind)=>
      kind==="gallery"?{dueIds:["one"],active:0}:empty());
    const dispatch=vi.fn(async()=>{throw Error("499");});
    const recover=createCloudruMediaRecovery({
      env,now:()=>tick,inspect,dispatch,pause:noWait,
    });
    expect(await recover()).toEqual({dispatched:0});
    tick+=59_000;await recover();
    expect(dispatch).toHaveBeenCalledTimes(1);
    tick+=1000;await recover();
    expect(dispatch).toHaveBeenCalledTimes(2);
    tick+=60_000;await recover();
    expect(dispatch).toHaveBeenCalledTimes(2);
    tick+=60_000;await recover();
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(inspect.mock.calls.filter(([kind])=>kind==="gallery").length).toBeGreaterThan(4);
  });

  it("DB/S3 failure does not mean empty and cannot stop another queue", async () => {
    const errors=vi.fn();
    const dispatch=vi.fn(async()=>({dispatched:1}));
    const recover=createCloudruMediaRecovery({env,pause:noWait,
      inspect:async kind=>{
        if(kind==="questions") throw Error("private S3 timed out");
        return kind==="feed-photo"?{dueIds:["p1"],active:0}:empty();
      },dispatch,report:errors,
    });
    expect(await recover()).toEqual({dispatched:1});
    expect(dispatch).toHaveBeenCalledWith("feed-photo");
    expect(errors).toHaveBeenCalledWith("questions","check");
  });

  it("does not overlap two minute ticks while previous processing is active", async () => {
    let done!:()=>void;
    const defer=new Promise<void>(r=>done=r);
    const dispatch=vi.fn(async()=>{await defer;return {dispatched:1};});
    const recover=createCloudruMediaRecovery({env,pause:noWait,
      inspect:async kind=>kind==="gallery"?{dueIds:["g"],active:0}:empty(),
      dispatch,
    });
    const first=recover();
    expect(await recover()).toEqual({skipped:true,dispatched:0});
    done();
    expect(await first).toEqual({dispatched:1});
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("skips disabled processors, without probing or executing", async () => {
    const inspect=vi.fn(async()=>({dueIds:["g"],active:0}));
    const dispatch=vi.fn(async()=>({dispatched:1}));
    expect(await createCloudruMediaRecovery({env:{},inspect,dispatch})())
      .toEqual({disabled:true,dispatched:0});
    expect(inspect).not.toHaveBeenCalled();
    const onlyGallery={...env,FEED_PROCESSOR_READY:"false",
      QUESTIONS_PROCESSOR_READY:"false"};
    const recover=createCloudruMediaRecovery({env:onlyGallery,inspect,dispatch,pause:noWait});
    expect(await recover()).toEqual({dispatched:1});
    expect(inspect).toHaveBeenCalledWith("gallery");
    expect(inspect).toHaveBeenCalledTimes(8);
    expect(enabledRecoveryKind("questions",{...env,QUESTIONS_PUBLIC_S3_ENABLED:"false"}))
      .toBe(false);
  });
});

describe("read-only due inspections match Core's lease policies", () => {
  it("inspects runnable Gallery uploads, cleanup jobs and in-flight leases", async () => {
    db.galleryJobs.mockResolvedValue([{id:"a"}]);
    db.galleryUploads.mockResolvedValue([{id:"b"}]);
    db.galleryJobCount.mockResolvedValue(1);
    db.galleryUploadCount.mockResolvedValue(2);
    expect(await inspectDueCloudruWork("gallery")).toEqual({
      dueIds:["job:a","upload:b"],active:3,
    });
    expect(db.galleryJobs.mock.calls[0]![0].where.createdAt.lte)
      .toBeInstanceOf(Date);
    expect(db.galleryUploads.mock.calls[0]![0].where.updatedAt.lte)
      .toBeInstanceOf(Date);
    expect(db.galleryJobs.mock.calls[0]![0].where.OR).toContainEqual({
      status:"pending",availableAt:{lte:expect.any(Date)},
    });
    expect(db.galleryUploads.mock.calls[0]![0].where.OR).toContainEqual({
      status:"uploaded",nextAttemptAt:{lte:expect.any(Date)},
    });
    expect(db.galleryJobCount.mock.calls[0]![0].where).toEqual({
      status:"processing",leaseUntil:{gt:expect.any(Date)},
    });
    expect(await hasDueCloudruWork("gallery")).toBe(true);
  });

  it("separates due Feed video from photo and avoids currently leased jobs", async () => {
    db.feedJobs.mockResolvedValueOnce([{id:"v"}]).mockResolvedValueOnce([]);
    db.feedJobCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await inspectDueCloudruWork("feed-video")).toEqual({
      dueIds:["v"],active:1,
    });
    expect(db.feedJobs.mock.calls[0]![0].where.kind).toBe("publish_video");
    expect(db.feedJobs.mock.calls[0]![0].where.createdAt.lte)
      .toBeInstanceOf(Date);
    expect(db.feedJobs.mock.calls[0]![0].where.OR).toContainEqual({
      status:"processing",leaseUntil:{lt:expect.any(Date)},
    });
    expect(await inspectDueCloudruWork("feed-photo")).toEqual(empty());
    expect(db.feedJobs.mock.calls[1]![0].where.kind.in).toEqual([
      "copy_album","publish_photo","delete_keys","cleanup_source",
    ]);
  });

  it("checks only private S3 Question work markers, never public QuestionPhoto rows", async () => {
    db.questionsKeys.mockResolvedValue(["questions/jobs/pending/questions/user/id/source.jpg"]);
    expect(await inspectDueCloudruWork("questions")).toEqual({
      dueIds:["questions/jobs/pending/questions/user/id/source.jpg"],active:0,
    });
    expect(db.galleryJobs).not.toHaveBeenCalled();
    expect(db.feedJobs).not.toHaveBeenCalled();
  });
});
