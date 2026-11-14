import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: vi.fn(), update: vi.fn(), remove: vi.fn(), groups:vi.fn(),oldest:vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  questionLegacyPhotoDeletion: {
    findMany: (...args: unknown[]) => state.rows(...args),
    groupBy:(...args:unknown[])=>state.groups(...args),
    findFirst:(...args:unknown[])=>state.oldest(...args),
    updateMany: (...args: unknown[]) => state.update(...args),
  },
}}));
vi.mock("@gafus/cdn-upload", () => ({
  deleteFileFromCDN: (...args: unknown[]) => state.remove(...args),
  parsePrivateMediaLocation: (value: string) => {
    if (!value.startsWith("cloudru:")) return null;
    const key = value.slice("cloudru:questions:".length);
    return {kind:"questions",key};
  },
}));
vi.mock("@gafus/media-server/question-v2-cleanup", () => ({
  scheduleQuestionsV2Cleanup: vi.fn(),
}));
vi.mock("./service.js", () => ({
  questionActor: vi.fn(), QuestionError: class extends Error {},
}));
import { processDueLegacyQuestionPhotoDeletions, validatedLegacyQuestionPhotoLocator,
  renderQuestionsLegacyDeletionMetricsPrometheus }
  from "./photos.js";
const at = new Date("2026-11-07T10:00:00Z");
const row = { id:"old-photo",ownerId:"owner-1",
  locator:"questions/owner-1/old.jpg",attempts:0 };
beforeEach(()=>{
  vi.resetAllMocks();
  state.rows.mockResolvedValue([row]);
  state.update.mockResolvedValue({count:1});
  state.remove.mockResolvedValue(undefined);
});
describe("Questions legacy S3 deletion durable outbox owner and lease guarantees",()=>{
  it("deletes only owner-bound exact key after lease claim; ACKs by token",async()=>{
    expect(await processDueLegacyQuestionPhotoDeletions({now:()=>at})).toEqual({
      claimed:1,done:1,retry:0,failed:0,
    });
    expect(state.remove).toHaveBeenCalledExactlyOnceWith("questions/owner-1/old.jpg");
    const [claim,ack] = state.update.mock.calls.map(x=>x[0] as any);
    expect(claim.where.id).toBe("old-photo");
    expect(claim.where.attempts).toEqual({lt:5});
    expect(claim.data).toMatchObject({status:"PROCESSING",
      attemptToken:expect.any(String),attempts:{increment:1}});
    expect(ack.where).toMatchObject({
      id:"old-photo",status:"PROCESSING",attemptToken:claim.data.attemptToken,
    });
    expect(ack.data).toMatchObject({status:"DONE",leaseUntil:null,attemptToken:null,
      ownerId:"",locator:""});
  });
  it("does not call S3 if a concurrent Worker claimed first",async()=>{
    state.update.mockResolvedValueOnce({count:0});
    expect(await processDueLegacyQuestionPhotoDeletions({now:()=>at}))
      .toEqual({claimed:0,done:0,retry:0,failed:0});
    expect(state.remove).not.toHaveBeenCalled();
  });
  it("requeues after transient provider failures without revealing exception text",async()=>{
    state.remove.mockRejectedValueOnce(Error("SECRET_PROVIDER_CREDENTIALS"));
    expect(await processDueLegacyQuestionPhotoDeletions({now:()=>at}))
      .toEqual({claimed:1,done:0,retry:1,failed:0});
    const retry=state.update.mock.calls[1][0] as any;
    expect(retry.data).toMatchObject({
      status:"PENDING",attemptToken:null,
      errorCode:"QUESTIONS_LEGACY_DELETE_FAILED",
    });
    expect(JSON.stringify(retry)).not.toContain("SECRET_PROVIDER_CREDENTIALS");
    expect(retry.data.availableAt.getTime()).toBeGreaterThan(at.getTime());
  });
  it("fifth failure is terminal and never releases somebody else's lease",async()=>{
    state.rows.mockResolvedValueOnce([{...row,attempts:4}]);
    state.remove.mockRejectedValueOnce(Error("STORAGE_OFFLINE"));
    expect(await processDueLegacyQuestionPhotoDeletions({now:()=>at})).toEqual({
      claimed:1,done:0,retry:0,failed:1,
    });
    const result=state.update.mock.calls[1][0] as any;
    expect(result.data.status).toBe("FAILED");
    expect(result.where.attemptToken).toBe(
      (state.update.mock.calls[0][0] as any).data.attemptToken);
  });
  it("fails closed on forged owner, foreign bucket and path traversal",async()=>{
    for(const unsafe of ["questions/owner-2/old.jpg",
      "questions/owner-1/../../admin.png",
      "https://evil.invalid/owner-1/old.jpg",
      "cloudru:questions:questions/uploads/questions/owner-2/old.jpg"]){
      expect(()=>validatedLegacyQuestionPhotoLocator(unsafe,"owner-1")).toThrow();
    }
    state.rows.mockResolvedValueOnce([{...row,locator:"questions/owner-2/old.jpg"}]);
    expect(await processDueLegacyQuestionPhotoDeletions({now:()=>at}))
      .toMatchObject({done:0,retry:1});
    expect(state.remove).not.toHaveBeenCalled();
  });
  it("cannot claim DONE/FAILED or backlogged attempts beyond retry limit",async()=>{
    state.rows.mockResolvedValue([]);
    expect(await processDueLegacyQuestionPhotoDeletions({now:()=>at,limit:1000}))
      .toEqual({claimed:0,done:0,retry:0,failed:0});
    expect((state.rows.mock.calls[0][0] as any)).toMatchObject({
      take:30,where:{attempts:{lt:5}},
    });
  });
  it("does not report success when SQL ACK loses lease after remote DeleteObject",async()=>{
    state.update.mockResolvedValueOnce({count:1}).mockResolvedValueOnce({count:0});
    expect(await processDueLegacyQuestionPhotoDeletions({now:()=>at}))
      .toEqual({claimed:1,done:0,retry:0,failed:0});
    expect(state.remove).toHaveBeenCalledOnce();
  });
});


describe("legacy deletion Prometheus metrics and migration-first safety",()=>{
  it("does not query a pre-migration database while rollout flag is disabled",async()=>{
    vi.resetAllMocks();
    const result=await renderQuestionsLegacyDeletionMetricsPrometheus(at,{
      QUESTIONS_LEGACY_PHOTO_DELETE_WORKER_ENABLED:"false",
    });
    expect(result).toContain("gafus_questions_legacy_delete_enabled 0");
    expect(result).toContain("gafus_questions_legacy_delete_pending 0");
    expect(result).toContain("gafus_questions_legacy_delete_failed 0");
    expect(state.groups).not.toHaveBeenCalled();
    expect(state.oldest).not.toHaveBeenCalled();
  });
  it("exports only anonymous queue counts and backlog age when opt-in enabled",async()=>{
    vi.resetAllMocks();
    state.groups.mockResolvedValue([
      {status:"PENDING",_count:{_all:3}},
      {status:"PROCESSING",_count:{_all:2}},
      {status:"FAILED",_count:{_all:1}},
    ]);
    state.oldest.mockResolvedValue({
      createdAt:new Date(at.getTime()-7*60_000),
    });
    const metrics=await renderQuestionsLegacyDeletionMetricsPrometheus(at,{
      QUESTIONS_LEGACY_PHOTO_DELETE_WORKER_ENABLED:"true",
    });
    for(const value of [
      "gafus_questions_legacy_delete_enabled 1",
      "gafus_questions_legacy_delete_pending 3",
      "gafus_questions_legacy_delete_processing 2",
      "gafus_questions_legacy_delete_failed 1",
      "gafus_questions_legacy_delete_oldest_age_seconds 420",
    ])expect(metrics).toContain(value);
    expect(metrics).not.toMatch(/owner-1|old-photo|\.jpg|storagePath|locator/);
  });
  it("fails closed instead of forging healthy queue metrics if SQL unavailable",async()=>{
    vi.resetAllMocks();
    state.groups.mockRejectedValueOnce(Error("SYNTHETIC_DATABASE_OFFLINE"));
    state.oldest.mockResolvedValue(null);
    await expect(renderQuestionsLegacyDeletionMetricsPrometheus(at,{
      QUESTIONS_LEGACY_PHOTO_DELETE_WORKER_ENABLED:"true",
    })).rejects.toThrow("SYNTHETIC_DATABASE_OFFLINE");
  });
});
