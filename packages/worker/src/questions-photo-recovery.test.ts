import { afterEach,describe,expect,it,vi } from "vitest";
import { createHash,createHmac,randomUUID } from "node:crypto";
import { questionsV2CleanupKeys } from "@gafus/cdn-upload";
import { createQuestionsPhotoRecoveryTick, questionsPhotoCleanupInternal } from "./questions-photo-recovery";

afterEach(()=>vi.unstubAllGlobals());
const mediaId=randomUUID(),cleanupToken=randomUUID(),ownerId="owner_1";
const secret="isolated-questions-secret-longer-than-32-bytes";
const base="/internal/questions/media/jobs/";
const valid={mediaId,cleanupToken,ownerId,
  sourceKey:`questions/v2/${ownerId}/${mediaId}/incoming/source.webp`,
  sourceMime:"image/webp",cleanupKind:"SOURCE" as const,
  cleanupLeaseUntil:new Date(Date.now()+150_000).toISOString(),
};
function setup(job:Record<string,unknown>|null=valid,overrides?:Record<string,string>){
  const env={...process.env,QUESTIONS_V2_MEDIA_ENABLED:"true",
    QUESTIONS_V2_INTERNAL_BASE_URL:"http://127.0.0.1:3001/",
    QUESTIONS_V2_INTERNAL_HMAC_SECRET:secret,GAFUS_LOCAL_ISOLATED_API:"1",
    NODE_ENV:"test",...overrides};
  const visited:string[]=[];
  const http=vi.fn(async(url:string,options:RequestInit)=>{
    const route=url.split("/internal/questions/media/jobs/")[1];
    expect(url).toBe("http://127.0.0.1:3001"+base+route);
    expect(options.redirect).toBe("error");
    const headers=options.headers as Record<string,string>;
    const hash=createHash("sha256").update(String(options.body)).digest("hex");
    const signature=createHmac("sha256",secret).update([
      "POST",base+route,headers["x-questions-timestamp"],
      headers["x-questions-nonce"],hash,
    ].join("\n")).digest("hex");
    expect(headers["x-questions-signature"]).toBe(signature);
    visited.push(route!);
    if(route==="claim")return new Response(JSON.stringify({job}),{status:200});
    if(route==="complete"||route==="fail")return new Response(JSON.stringify({accepted:true}),{status:200});
    throw Error("UNEXPECTED_ROUTE");
  });
  const deleteObjects=vi.fn(async(_keys:readonly string[])=>undefined);
  return {env,http,deleteObjects,visited};
}
describe("Questions photo physical S3 DELETE exclusively in existing Worker",()=>{
 it("does not call S3 if no cleanup lease was issued",async()=>{
  const s=setup(null);
  await expect(questionsPhotoCleanupInternal(s)).resolves.toEqual({cleaned:false});
  expect(s.visited).toEqual(["claim"]);
  expect(s.deleteObjects).not.toHaveBeenCalled();
 });
 it("deletes exact SOURCE + small WebP keys, then acknowledges PG lease",async()=>{
  const s=setup();
  await expect(questionsPhotoCleanupInternal(s)).resolves.toEqual({cleaned:true});
  expect(s.deleteObjects).toHaveBeenCalledExactlyOnceWith(questionsV2CleanupKeys(valid));
  expect(s.visited).toEqual(["claim","complete"]);
  const finished=JSON.parse(String(s.http.mock.calls[1]?.[1].body));
  expect(finished).toEqual({mediaId,cleanupToken,cleanupKind:"SOURCE"});
  expect(s.visited).not.toContain("cleanup");
 });
 it("deletes all four exact keys on FAILED/EXPIRED, not an S3 prefix",async()=>{
  const job={...valid,cleanupKind:"ALL" as const};
  const s=setup(job);
  await expect(questionsPhotoCleanupInternal(s)).resolves.toEqual({cleaned:true});
  expect(s.deleteObjects).toHaveBeenCalledWith(questionsV2CleanupKeys(job));
  expect(questionsV2CleanupKeys(job)).toHaveLength(4);
 });
 it("rejects a forged owner/path and never touches S3 or acknowledges cleanup",async()=>{
  const s=setup({...valid,sourceKey:`questions/v2/another/${mediaId}/incoming/source.webp`});
  await expect(questionsPhotoCleanupInternal(s)).rejects.toThrow("UNTRUSTED_CLEANUP_SOURCE");
  expect(s.visited).toEqual(["claim"]);
  expect(s.deleteObjects).not.toHaveBeenCalled();
 });
 it("rejects arbitrary extra keys even when claim has a valid HMAC transport",async()=>{
  const s=setup({...valid,keys:["untrusted/other/file.webp"]});
  await expect(questionsPhotoCleanupInternal(s)).rejects.toThrow("UNTRUSTED_CLAIM");
  expect(s.deleteObjects).not.toHaveBeenCalled();
 });
 it("on failed DELETE calls fail receipt and NEVER complete",async()=>{
  const s=setup();s.deleteObjects.mockRejectedValueOnce(Error("S3 503"));
  await expect(questionsPhotoCleanupInternal(s)).rejects.toThrow("DELETE_RETRY");
  expect(s.visited).toEqual(["claim","fail"]);
 });
 it("on lost completion ACK does not claim success or send fail after S3 success",async()=>{
  const s=setup();
  const original=s.http.getMockImplementation()!;
  s.http.mockImplementation(async(url:string,options:RequestInit)=>{
    if(url.endsWith("/complete"))return new Response(JSON.stringify({accepted:false}),{status:200});
    return original(url,options);
  });
  await expect(questionsPhotoCleanupInternal(s)).rejects.toThrow("COMPLETION_UNACKNOWLEDGED");
  expect(s.deleteObjects).toHaveBeenCalledOnce();
  expect(s.visited).toEqual(["claim"]);
 });
 it("blocks production origin lookalikes before a claim or S3 DELETE",async()=>{
  const s=setup(valid,{GAFUS_LOCAL_ISOLATED_API:"0",NODE_ENV:"production",
    QUESTIONS_V2_INTERNAL_BASE_URL:"https://evil.gafus.ru/",
    QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED:"true",
    QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME:"evil.gafus.ru"});
  await expect(questionsPhotoCleanupInternal(s)).rejects.toThrow("UNSAFE_ORIGIN");
  expect(s.http).not.toHaveBeenCalled();
  expect(s.deleteObjects).not.toHaveBeenCalled();
 });
});
describe("Questions cleanup local scheduler",()=>{
 it("is non-overlapping; failure stays retryable without any Cloud photo Jobs",async()=>{
  let release!:()=>void;
  const cleanup=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));
  const tick=createQuestionsPhotoRecoveryTick({cleanup});
  const inFlight=tick();
  await expect(tick()).resolves.toEqual({skipped:true,dispatched:0});
  release();await expect(inFlight).resolves.toEqual({dispatched:0});
  expect(cleanup).toHaveBeenCalledOnce();
  cleanup.mockRejectedValueOnce(Error("S3 retry"));
  await expect(tick()).resolves.toEqual({dispatched:0});
 });
});
