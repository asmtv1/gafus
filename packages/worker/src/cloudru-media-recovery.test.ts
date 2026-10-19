import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  galleryJob: vi.fn(), galleryUpload: vi.fn(), feedJob: vi.fn(),
  questionsWork: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    galleryStorageJob: { findFirst: db.galleryJob },
    galleryUpload: { findFirst: db.galleryUpload },
    feedStorageJob: { findFirst: db.feedJob },
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  hasPendingQuestionCloudWork: db.questionsWork,
}));
import {
  createCloudruMediaRecovery, enabledRecoveryKind, hasDueCloudruWork,
  type RecoveryKind,
} from "./cloudru-media-recovery";

const env = {
  CLOUDRU_MEDIA_JOBS_ENABLED: "true",
  CLOUDRU_PROJECT_ID: "12345678-1234-1234-1234-123456789012",
  CLOUDRU_KEY_ID: "test-key", CLOUDRU_KEY_SECRET: "test-secret",
  GALLERY_PROCESSOR_READY: "true", FEED_PROCESSOR_READY: "true",
  QUESTIONS_PROCESSOR_READY: "true", QUESTIONS_CLOUD_JOB_ENABLED: "true",
  QUESTIONS_PUBLIC_S3_ENABLED: "true",
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const query of [db.galleryJob, db.galleryUpload, db.feedJob])
    query.mockResolvedValue(null);
  db.questionsWork.mockResolvedValue(false);
});

describe("five-minute Cloud.ru work-aware recovery", () => {
  it("never executes ANY Cloud.ru Job for empty durable queues", async () => {
    const check = vi.fn(async (_kind: RecoveryKind) => false);
    const dispatch = vi.fn();
    const recovery = createCloudruMediaRecovery({env, check, dispatch});
    expect(await recovery()).toEqual({dispatched: 0});
    expect(check.mock.calls.map(([k]) => k)).toEqual([
      "gallery", "feed-photo", "feed-video", "questions",
    ]);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("launches only due kinds and the correct Feed photo/video pool", async () => {
    const check = vi.fn(async (kind:RecoveryKind) =>
      kind === "feed-video" || kind === "questions");
    const dispatch = vi.fn(async (_kind: RecoveryKind) => ({dispatched: 1}));
    const recovery = createCloudruMediaRecovery({env, check, dispatch});
    expect(await recovery()).toEqual({dispatched: 2});
    expect(dispatch.mock.calls.map(([k]) => k).sort()).toEqual(["feed-video", "questions"]);
  });
  it("a Gallery 499 cannot starve Feed and Questions; exponential cooldown per kind", async () => {
    let tick=10000000;
    const failed=vi.fn();
    const dispatch = vi.fn(async (kind:RecoveryKind) => {
      if (kind === "gallery") throw new Error("499");
      return {dispatched: 1};
    });
    const recovery = createCloudruMediaRecovery({
      env, check: async () => true, dispatch, now:()=>tick,
      report: failed,
    });
    expect(await recovery()).toEqual({dispatched: 3});
    expect(failed).toHaveBeenCalledWith("gallery","execute");
    expect(dispatch).toHaveBeenCalledTimes(4);
    tick+=300000;
    expect(await recovery()).toEqual({dispatched: 3});
    tick+=300000;
    expect(await recovery()).toEqual({dispatched: 3}); // Gallery cooldown 10m after its second failure
    expect(dispatch.mock.calls.filter(([kind])=>kind==="gallery")).toHaveLength(2);
    tick+=300000;
    expect(await recovery()).toEqual({dispatched: 3});
    expect(dispatch.mock.calls.filter(([kind])=>kind==="gallery")).toHaveLength(3);
  });
  it("DB/S3 probe failure is not interpreted as empty and does not block other queues", async () => {
    const reported=vi.fn();
    const execute=vi.fn(async()=>({dispatched:1}));
    const recovery=createCloudruMediaRecovery({env,
      check: async kind => {if(kind==="questions")throw Error("S3 unavailable");return kind==="feed-photo";},
      dispatch:execute, report:reported,
    });
    expect(await recovery()).toEqual({dispatched:1});
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith("feed-photo");
    expect(reported).toHaveBeenCalledWith("questions","check");
  });
  it("does not create new launches while earlier poll is still in progress", async () => {
    let done!: () => void;
    const deferred=new Promise<void>(resolve=>done=resolve);
    const dispatch=vi.fn(async()=>{await deferred;return {dispatched:1};});
    const recovery=createCloudruMediaRecovery({env,
      check:async kind=>kind==="gallery",dispatch});
    const first=recovery();
    expect(await recovery()).toEqual({skipped:true,dispatched:0});
    done();
    expect(await first).toEqual({dispatched:1});
    expect(dispatch).toHaveBeenCalledOnce();
  });
  it("won't dispatch if globally disabled or an individual processor is not ready", async () => {
    const dispatch=vi.fn();
    const check=vi.fn(async()=>true);
    expect(await createCloudruMediaRecovery({env:{},check,dispatch})())
      .toEqual({disabled:true,dispatched:0});
    expect(check).not.toHaveBeenCalled();
    const onlyGallery={...env, FEED_PROCESSOR_READY:"false",
      QUESTIONS_PROCESSOR_READY:"false"};
    expect(await createCloudruMediaRecovery({env:onlyGallery,check,
      dispatch:async()=>({dispatched:1})})()).toEqual({dispatched:1});
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledWith("gallery");
    expect(enabledRecoveryKind("questions", {...env,QUESTIONS_PUBLIC_S3_ENABLED:"false"})).toBe(false);
  });
  it("resets cooldown after queue drains, preventing permanent suppression", async () => {
    let tick=0, busy=true;
    const dispatch=vi.fn().mockRejectedValueOnce(Error("499")).mockResolvedValue({dispatched:1});
    const recovery=createCloudruMediaRecovery({env,
      check:async kind=>kind==="gallery"&&busy,
      now:()=>tick,dispatch});
    expect(await recovery()).toEqual({dispatched:0});
    tick+=300000;busy=false;
    expect(await recovery()).toEqual({dispatched:0});
    busy=true;
    expect(await recovery()).toEqual({dispatched:1});
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});

describe("read-only, matching Core due-job predicates", () => {
  it("uses separate database queues and selects only runnable Gallery work", async () => {
    const at=new Date("2026-10-19T18:00:00Z");
    expect(await hasDueCloudruWork("gallery",at)).toBe(false);
    expect(db.galleryJob).toHaveBeenCalledWith({
      where:{OR:[
        {status:"pending",availableAt:{lte:at}},
        {status:"processing",leaseUntil:{lt:at}},
      ]},select:{id:true},
    });
    const where=db.galleryUpload.mock.calls[0]![0].where;
    expect(where.OR).toContainEqual({status:"uploaded",nextAttemptAt:{lte:at}});
    expect(where.OR).toContainEqual({status:"processing",leaseUntil:{lte:at}});
    expect(where.OR).toContainEqual({
      status:{in:["reserved","uploaded","processing"]},reservationExpiresAt:{lte:at},
    });
    db.galleryJob.mockResolvedValueOnce({id:"job"});
    expect(await hasDueCloudruWork("gallery",at)).toBe(true);
  });
  it("sends only matching due Feed kinds; video does not launch for photo cleanup", async () => {
    const at=new Date("2026-10-19T18:00:00Z");
    expect(await hasDueCloudruWork("feed-photo",at)).toBe(false);
    expect(db.feedJob.mock.calls[0]?.[0].where.kind.in).toEqual([
      "copy_album", "publish_photo", "delete_keys", "cleanup_source",
    ]);
    expect(db.feedJob.mock.calls[0]?.[0].where.OR).toContainEqual({
      status:"processing",leaseUntil:{lt:at},
    });
    expect(await hasDueCloudruWork("feed-video",at)).toBe(false);
    expect(db.feedJob.mock.calls[1]?.[0].where.kind).toBe("publish_video");
    db.feedJob.mockResolvedValueOnce({id:"video"});
    expect(await hasDueCloudruWork("feed-video",at)).toBe(true);
  });
  it("reads private S3 work records, not unrelated QuestionPhoto rows", async () => {
    db.questionsWork.mockResolvedValueOnce(true);
    expect(await hasDueCloudruWork("questions")).toBe(true);
    expect(db.questionsWork).toHaveBeenCalledOnce();
    expect(db.feedJob).not.toHaveBeenCalled();
    expect(db.galleryJob).not.toHaveBeenCalled();
  });
});
