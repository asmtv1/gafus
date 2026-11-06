import { fileURLToPath } from "node:url";
import {describe,it,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {readdir} from "node:fs/promises";
import {chat2V2FinalKeys,chat2V2SourceKey,type Chat2V2Job,type Chat2V2Manifest} from "@gafus/feed-cloud";
import {createChat2JobRunner,type Chat2V2Claim,type Chat2V2Core} from "./chat2-job-runner.js";
const root=fileURLToPath(new URL("../", import.meta.url));
const fixture=():Chat2V2Claim=>{
  const conversationId="room1",ownerId="person1",mediaId=randomUUID(),sourceMime="image/jpeg";
  return {conversationId,ownerId,mediaId,sourceMime,sourceBytes:32,
    sourceKey:chat2V2SourceKey(conversationId,ownerId,mediaId,sourceMime),
    attemptToken:"valid_chat2_lease_abcdef0123456789",leaseUntil:new Date(Date.now()+120_000).toISOString()};
};
const imageManifest=(job:Chat2V2Job):Chat2V2Manifest=>({
  kind:"image",width:720,height:480,
  imageSizes:{small:{width:360,height:240},medium:{width:720,height:480}},
  keys:chat2V2FinalKeys(job.conversationId,job.ownerId,job.mediaId).image,
});
function mocks(job:Chat2V2Claim|null){
  const core:Chat2V2Core={
    claimOne:vi.fn(async()=>job),renew:vi.fn(async()=>({accepted:true})),
    complete:vi.fn(async()=>({accepted:true})),fail:vi.fn(async()=>undefined),
  };
  const objectsFor=vi.fn(()=>({download:vi.fn(),create:vi.fn(),createFile:vi.fn()}));
  return {core,objectsFor};
}
describe("Cloud Chat2 Job process-one leased claim",()=>{
  it("returns idle without creating a workdir for empty queue",async()=>{
    const {core,objectsFor}=mocks(null);
    const count=await createChat2JobRunner({core,kind:"image",objectsFor,workRoot:root,engine:{} as never})();
    expect(count).toBe(0);expect(objectsFor).not.toHaveBeenCalled();
  });
  it("validates output before completing and cleans the attempt folder",async()=>{
    const job=fixture();const {core,objectsFor}=mocks(job);
    const manifest=imageManifest(job);const before=await readdir(root);
    const process=vi.fn(async()=>manifest);
    const count=await createChat2JobRunner({core,kind:"image",objectsFor,workRoot:root,
      engine:{} as never,process:process as never})();
    expect(count).toBe(1);
    expect(core.complete).toHaveBeenCalledWith(job,manifest);
    expect(core.fail).not.toHaveBeenCalled();
    expect((await readdir(root)).filter(x=>x.startsWith(".chat2-job-")))
      .toEqual(before.filter(x=>x.startsWith(".chat2-job-")));
  });
  it("fails malformed output without promoting READY",async()=>{
    const job=fixture();const {core,objectsFor}=mocks(job);
    const invalid={...imageManifest(job),kind:"image",keys:{small:"outside/s.webp",medium:"outside/m.webp"}} as never;
    await expect(createChat2JobRunner({core,kind:"image",objectsFor,workRoot:root,
      engine:{} as never,process:vi.fn(async()=>invalid) as never})())
      .rejects.toThrow("CHAT2_V2_INVALID_MANIFEST");
    expect(core.complete).not.toHaveBeenCalled();expect(core.fail).toHaveBeenCalled();
  });
  it("does not falsify a failure if READY callback result is ambiguous",async()=>{
    const job=fixture();const {core,objectsFor}=mocks(job);
    core.complete=vi.fn(async()=>{throw Error("NETWORK_UNCERTAIN");});
    await expect(createChat2JobRunner({core,kind:"image",objectsFor,workRoot:root,
      engine:{} as never,process:vi.fn(async()=>imageManifest(job)) as never})())
      .rejects.toThrow("NETWORK_UNCERTAIN");
    expect(core.fail).not.toHaveBeenCalled();
  });
});


describe("chat photo/video job cannot steal opposite kind",()=>{
 it("rejects a wrong-kind Cloud claim before reading S3",async()=>{
  const job=fixture();const {core,objectsFor}=mocks(job);
  await expect(createChat2JobRunner({core,kind:"video",objectsFor,workRoot:root,
    engine:{} as never})()).rejects.toThrow("CHAT2_JOB_WRONG_KIND");
  expect(core.claimOne).toHaveBeenCalledWith("video");
  expect(objectsFor).not.toHaveBeenCalled();
  expect(core.complete).not.toHaveBeenCalled();
 });
});

describe("Safe Chat2 360 Cloud failure diagnostics",()=>{
 it("reports only a phase, safe category and integer HTTP status",async()=>{
  const base=fixture();
  const job={...base,sourceMime:"video/mp4" as const,phase:"background_360" as const,
    sourceKey:chat2V2SourceKey(base.conversationId,base.ownerId,base.mediaId,"video/mp4")};
  const {core,objectsFor}=mocks(job);
  const onFailure=vi.fn();
  const process=vi.fn(async (_job:unknown,_dir:unknown,deps:{onPhase?:(phase:"download")=>void})=>{
    deps.onPhase?.("download");
    throw Object.assign(Error("https://private.example/path?token=SECRET"),
      {name:"AccessDenied",$metadata:{httpStatusCode:403}});
  });
  await expect(createChat2JobRunner({core,kind:"video",objectsFor,workRoot:root,
    engine:{} as never,process:process as never,onFailure})()).rejects.toThrow();
  expect(onFailure).toHaveBeenCalledWith({phase:"download",category:"AccessDenied",status:403});
  expect(JSON.stringify(onFailure.mock.calls)).not.toContain("SECRET");
 });
 it("does not copy potentially sensitive error strings to diagnostics",async()=>{
  const {chat2SafeErrorCategory,chat2SafeErrorStatus}=await import("./chat2-job-runner.js");
  const e=Object.assign(Error("password=abc456 and https://private"),{name:"NetworkRequestError",$metadata:{httpStatusCode:302}});
  expect(chat2SafeErrorCategory(e)).toBe("UNKNOWN");
  expect(chat2SafeErrorStatus(e)).toBeNull();
  expect(chat2SafeErrorCategory(Error("CHAT2_360_PHASE_MISMATCH"))).toBe("CHAT2_360_PHASE_MISMATCH");
 });
});
