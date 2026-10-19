import {beforeEach, describe, expect, it, vi} from "vitest";
const mocked=vi.hoisted(()=>({send:vi.fn(), destroy:vi.fn()}));
vi.mock("@aws-sdk/client-s3",()=>{
  class Command { constructor(public input:Record<string,unknown>){} }
  return {
    S3Client:class {send=mocked.send;destroy=mocked.destroy;},
    PutObjectCommand:class PutObjectCommand extends Command{},
    CopyObjectCommand:class CopyObjectCommand extends Command{},
    GetObjectCommand:class GetObjectCommand extends Command{},
    HeadObjectCommand:class HeadObjectCommand extends Command{},
    DeleteObjectCommand:class DeleteObjectCommand extends Command{},
    ListObjectsV2Command:class ListObjectsV2Command extends Command{},
  };
});
import {
  questionCloudJobEnabled, pendingQuestionLocation, parsePendingQuestionLocation,
  questionImageVariantKeys, hasPendingQuestionCloudWork, listPendingQuestionCloudWorkKeys, uploadQuestionSource, promoteQuestionVariants,
  deleteQuestionSourceAndVariants, questionProcessingFailure,
} from "./publicQuestionMedia";
const config={
  QUESTIONS_PUBLIC_S3_ENABLED:"true",QUESTIONS_CLOUD_JOB_ENABLED:"true",
  QUESTIONS_PROCESSOR_READY:"true",QUESTIONS_CDN_LIVE_VERIFIED:"true",
  QUESTIONS_CDN_BASE_URL:"https://ebiteskukingusk.begetcdn.cloud",
  QUESTIONS_PUBLIC_S3_BUCKET:"gafus-questions-public",
  QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING:"disabled",
  CLOUDRU_S3_ENDPOINT:"https://s3.cloud.ru",CLOUDRU_S3_ACCESS_KEY_ID:"tenant:ci",
  CLOUDRU_S3_SECRET_ACCESS_KEY:"ci-example-secret",
};
const path="questions/owner-id/uuid-value.png";
const source="questions/incoming/questions/owner-id/uuid-value/source.png";
const marker="cloudru:questions-pending:"+source;
const notFound=()=>Object.assign(new Error("NoSuchKey"),{$metadata:{httpStatusCode:404}});
beforeEach(()=>{vi.clearAllMocks();mocked.send.mockResolvedValue({});});
describe("Questions S3 private staging and safe promotion",()=>{
  it("requires independently verified Job + CDN before writing sources",()=>{
    expect(questionCloudJobEnabled({...config,QUESTIONS_PUBLIC_S3_ENABLED:"false"})).toBe(false);
    expect(()=>questionCloudJobEnabled({...config,QUESTIONS_PROCESSOR_READY:"false"}))
      .toThrow("QUESTIONS_JOB_NOT_READY");
    expect(()=>questionCloudJobEnabled({...config,QUESTIONS_CLOUD_JOB_ENABLED:"false"}))
      .toThrow("QUESTIONS_JOB_NOT_READY");
    expect(questionCloudJobEnabled(config)).toBe(true);
    expect(pendingQuestionLocation(path)).toBe(marker);
    expect(parsePendingQuestionLocation(marker)).toBe(source);
    expect(()=>parsePendingQuestionLocation("cloudru:questions-pending:../secret"))
      .toThrow("QUESTION_PENDING_INVALID_LOCATION");
  });
  it("checks only bounded private Questions work markers before recovery",async()=>{
    expect(await hasPendingQuestionCloudWork(config)).toBe(false);
    const cmd=mocked.send.mock.calls[0]![0];
    expect(cmd.constructor.name).toBe("ListObjectsV2Command");
    expect(cmd.input).toMatchObject({
      Bucket:"gafus-questions-public",Prefix:"questions/jobs/pending/questions/",MaxKeys:20,
    });
    mocked.send.mockReset().mockResolvedValue({
      Contents:[{Key:"questions/jobs/pending/questions/owner/photo/source.jpg"}],
    });
    expect(await hasPendingQuestionCloudWork(config)).toBe(true);
    mocked.send.mockReset().mockResolvedValue({IsTruncated:true,Contents:[
      {Key:"questions/jobs/pending/questions/owner/photo/source.jpg"},
    ]});
    expect(await hasPendingQuestionCloudWork(config)).toBe(true);
    mocked.send.mockReset().mockResolvedValue({Contents:[
      {Key:"questions/jobs/pending/questions/owner/photo/source.jpg"},
      {Key:"questions/jobs/pending/questions/owner/photo2/source.png"},
    ]});
    expect(await listPendingQuestionCloudWorkKeys(config)).toEqual([
      "questions/jobs/pending/questions/owner/photo/source.jpg",
      "questions/jobs/pending/questions/owner/photo2/source.png",
    ]);
    mocked.send.mockReset().mockResolvedValue({Contents:[{
      Key:"questions/jobs/pending/questions/owner/new-photo/source.png",
      LastModified:new Date(),
    }]});
    expect(await listPendingQuestionCloudWorkKeys(config)).toEqual([]);
    mocked.send.mockReset().mockResolvedValue({Contents:[{Key:"questions/jobs/pending/forged/evil"}]});
    expect(await hasPendingQuestionCloudWork(config)).toBe(false);
    mocked.send.mockReset().mockResolvedValue({IsTruncated:true,Contents:[]});
    await expect(hasPendingQuestionCloudWork(config)).rejects.toThrow("QUESTIONS_RECOVERY_WORK_LIST_TRUNCATED");
    mocked.send.mockReset().mockRejectedValue(new Error("S3_UNAVAILABLE"));
    await expect(hasPendingQuestionCloudWork(config)).rejects.toThrow("S3_UNAVAILABLE");
    expect(mocked.destroy).toHaveBeenCalledTimes(8);
  });
  it("writes source ONLY into private incoming S3 prefix",async()=>{
    await uploadQuestionSource(path,new Uint8Array([1,2,3]),"image/png",config);
    const cmd=mocked.send.mock.calls[0]![0];
    expect(cmd.constructor.name).toBe("PutObjectCommand");
    expect(cmd.input).toMatchObject({Bucket:"gafus-questions-public",Key:source,
      ContentType:"image/png",CacheControl:"private, no-store",IfNoneMatch:"*"});
    const work=mocked.send.mock.calls[1]![0];
    expect(work.constructor.name).toBe("PutObjectCommand");
    expect(work.input).toMatchObject({Bucket:"gafus-questions-public",
      Key:"questions/jobs/pending/questions/owner-id/uuid-value/source.png",
      ContentType:"application/octet-stream",CacheControl:"private, no-store",IfNoneMatch:"*"});
  });
  it("never reports successful upload if durable work-record creation fails",async()=>{
    mocked.send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("S3_DOWN"));
    await expect(uploadQuestionSource(path,new Uint8Array([1,2,3]),"image/png",config))
      .rejects.toThrow("S3_DOWN");
    expect(mocked.send).toHaveBeenCalledTimes(2);
  });
  it("does not publish if one staged variant is missing",async()=>{
    mocked.send.mockResolvedValueOnce({ContentType:"image/webp",ContentLength:100})
      .mockRejectedValueOnce(notFound());
    expect(await promoteQuestionVariants(marker,config)).toEqual({state:"processing"});
    expect(mocked.send.mock.calls.map(([cmd])=>cmd.constructor.name))
      .toEqual(["HeadObjectCommand","HeadObjectCommand"]);
  });
  it("promotes two validated WebP variants only after successful private staging",async()=>{
    mocked.send.mockImplementation(async (cmd:{constructor:{name:string}})=>
      cmd.constructor.name==="HeadObjectCommand"
        ? {ContentType:"image/webp",ContentLength:1000}:{});
    const keys=questionImageVariantKeys(marker);
    expect(await promoteQuestionVariants(marker,config)).toEqual({
      state:"ready",location:keys.finalLocation,
    });
    const commands=mocked.send.mock.calls.map(([cmd])=>cmd);
    expect(commands.map(c=>c.constructor.name)).toEqual([
      "HeadObjectCommand","HeadObjectCommand","CopyObjectCommand","CopyObjectCommand",
    ]);
    expect(commands[2].input).toMatchObject({
      Key:keys.thumb,ContentType:"image/webp",MetadataDirective:"REPLACE",
      CacheControl:"public, max-age=180, must-revalidate",
    });
    expect(commands[3].input).toMatchObject({Key:keys.full,ContentType:"image/webp"});
  });
  it("rejects untrusted metadata and never copies non-WebP",async()=>{
    mocked.send.mockResolvedValueOnce({ContentType:"image/png",ContentLength:100});
    await expect(promoteQuestionVariants(marker,config)).rejects.toThrow("QUESTION_STAGED_WEBP_INVALID");
    expect(mocked.send).toHaveBeenCalledOnce();
  });
  it("reports private processing failures and deletes private/public object set",async()=>{
    mocked.send.mockResolvedValueOnce({
      ContentLength:24,Body:{transformToString:async()=>JSON.stringify({code:"INVALID_IMAGE"})},
    });
    expect(await questionProcessingFailure(marker,config)).toBe("INVALID_IMAGE");
    mocked.send.mockReset().mockImplementation(async (cmd:{constructor:{name:string}})=>{
      if(cmd.constructor.name==="HeadObjectCommand")throw notFound();
      return {};
    });
    await deleteQuestionSourceAndVariants(marker,config);
    expect(mocked.send.mock.calls.filter(([cmd])=>cmd.constructor.name==="DeleteObjectCommand")).toHaveLength(7);
    expect(mocked.send.mock.calls.filter(([cmd])=>cmd.constructor.name==="DeleteObjectCommand")
      .every(([cmd])=>String(cmd.input.Key).startsWith("questions/"))).toBe(true);
  });
});
