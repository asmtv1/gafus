import {afterEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({
  worker:vi.fn(),photo:vi.fn().mockResolvedValue({dispatched:1}),
  video:vi.fn().mockResolvedValue({dispatched:1}),
  create:vi.fn(),
  processor:undefined as undefined|((job:{data:{mediaId:string;kind:string}})=>Promise<void>),
}));
vi.mock("@gafus/queues",()=>({connection:{},CHAT2_MEDIA_PROCESSING_QUEUE_NAME:"chat2-media-v2-processing-trigger"}));
vi.mock("@gafus/logger",()=>({createWorkerLogger:()=>({error:vi.fn(),success:vi.fn()})}));
vi.mock("./cloudru-media-dispatcher.js",()=>({
  safeCloudruDispatchError:(error:unknown)=>error instanceof Error?error:Error("CLOUDRU_JOB_UNKNOWN_FAILURE"),
  createCloudruChatPoolDispatcher:(kind:string)=>{
  mocks.create(kind);return kind==="photo"?mocks.photo:mocks.video;
}}));
vi.mock("bullmq",()=>({
  UnrecoverableError:class UnrecoverableError extends Error {name="UnrecoverableError";},
  Worker:class{
 constructor(name:string,processor:typeof mocks.processor,options:unknown){mocks.worker(name,options);mocks.processor=processor;}
 on(){return this;}
}}));
const mediaId="8dc418f6-97da-42be-ab73-b3c172c95ccd";
const enabled=()=>{
 vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED","true");vi.stubEnv("CHAT2_PROCESSOR_READY","true");
 vi.stubEnv("CHAT2_V2_CORE_ENABLED","true");vi.stubEnv("CHAT2_V2_MEDIA_ENABLED","true");
};
describe("Chat2 media immediate triggers based on Feed",()=>{
 afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();mocks.processor=undefined;});
 it("never starts before all isolated Chat2 flags are ready",async()=>{
  vi.stubEnv("CHAT2_PROCESSOR_READY","false");
  const {startChat2MediaProcessingTriggerWorker}=await import("./chat2-media-processing-trigger-worker.js");
  startChat2MediaProcessingTriggerWorker();expect(mocks.worker).not.toHaveBeenCalled();
  vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED","true");
  startChat2MediaProcessingTriggerWorker();expect(mocks.worker).not.toHaveBeenCalled();
 });
 it("runs only video pool, rejects retired photo wake-ups",async()=>{
  enabled();
  const {startChat2MediaProcessingTriggerWorker}=await import("./chat2-media-processing-trigger-worker.js");
  startChat2MediaProcessingTriggerWorker();
  expect(mocks.create.mock.calls.map(x=>x[0])).toEqual(["video"]);
  expect(mocks.worker).toHaveBeenCalledWith("chat2-media-v2-processing-trigger",
    expect.objectContaining({concurrency:1,limiter:{max:1,duration:500}}));
  await expect(mocks.processor!({data:{mediaId,kind:"photo"}}))
    .rejects.toThrow("CHAT2_RETIRED_PHOTO_WAKE");
  await mocks.processor!({data:{mediaId,kind:"video"}});
  expect(mocks.photo).not.toHaveBeenCalled();expect(mocks.video).toHaveBeenCalledOnce();
 });
 it("rejects untrusted IDs/types and retries failed Cloud wake-ups",async()=>{
  enabled();const {startChat2MediaProcessingTriggerWorker}=await import("./chat2-media-processing-trigger-worker.js");
  startChat2MediaProcessingTriggerWorker();
  await expect(mocks.processor!({data:{mediaId:"../../escape",kind:"photo"}})).rejects.toThrow("CHAT2_INVALID_WAKE_ID");
  await expect(mocks.processor!({data:{mediaId,kind:"foreign"}})).rejects.toThrow("CHAT2_RETIRED_PHOTO_WAKE");
  mocks.video.mockResolvedValueOnce({dispatched:0});
  await expect(mocks.processor!({data:{mediaId,kind:"video"}})).rejects.toThrow("CHAT2_WAKE_NOT_DISPATCHED");
  expect(mocks.photo).not.toHaveBeenCalled();
 });
 it("does not ask BullMQ to retry an uncertain Cloud.ru :execute POST",async()=>{
  enabled();
  const {startChat2MediaProcessingTriggerWorker}=await import("./chat2-media-processing-trigger-worker.js");
  startChat2MediaProcessingTriggerWorker();
  mocks.video.mockRejectedValueOnce(Error("CLOUDRU_JOB_EXECUTION_NETWORK_TIMEOUT"));
  const failure=await mocks.processor!({data:{mediaId,kind:"video"}}).catch(error=>error);
  expect(failure.name).toBe("UnrecoverableError");
  expect(failure.message).toBe("CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN");
  expect(mocks.video).toHaveBeenCalledOnce();
  mocks.video.mockRejectedValueOnce(Error("CLOUDRU_JOB_IAM_UNAVAILABLE_503"));
  await expect(mocks.processor!({data:{mediaId,kind:"video"}}))
    .rejects.toThrow("CLOUDRU_JOB_IAM_UNAVAILABLE_503");
 });

});

describe("Chat2 Cloud.ru immediate wake fencing",()=>{
 it("never retries a rejected ID or retired photo wake",async()=>{
  enabled();
  const {startChat2MediaProcessingTriggerWorker}=await import("./chat2-media-processing-trigger-worker.js");
  startChat2MediaProcessingTriggerWorker();
  for(const data of [{mediaId:"not-a-uuid",kind:"video"},{mediaId,kind:"photo"}]){
   const failure=await mocks.processor!({data}).catch((error:Error)=>error);
   expect((failure as Error).name).toBe("UnrecoverableError");
  }
  expect(mocks.video).not.toHaveBeenCalled();
 });

 afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();mocks.processor=undefined;});
 it.each([
  ["CLOUDRU_JOB_EXECUTION_NETWORK_ECONNRESET","CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN"],
  ["CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video-2_502","CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN"],
  ["CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video_401","CLOUDRU_JOB_EXECUTION_PERMANENT_REJECTION"],
 ])("never immediately replays ambiguous or permanently rejected launch %s",async(code,expected)=>{
  enabled();
  const {startChat2MediaProcessingTriggerWorker}=await import("./chat2-media-processing-trigger-worker.js");
  startChat2MediaProcessingTriggerWorker();
  mocks.video.mockRejectedValueOnce(Error(code));
  await expect(mocks.processor!({data:{mediaId,kind:"video"}})).rejects.toThrow(expected);
  expect(mocks.video).toHaveBeenCalledOnce();
 });
 it("keeps known 429 as retryable",async()=>{
  enabled();
  const {startChat2MediaProcessingTriggerWorker}=await import("./chat2-media-processing-trigger-worker.js");
  startChat2MediaProcessingTriggerWorker();
  mocks.video.mockRejectedValueOnce(Error("CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video_429"));
  await expect(mocks.processor!({data:{mediaId,kind:"video"}})).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video_429");
  await expect(mocks.processor!({data:{mediaId,kind:"video"}})).resolves.toBeUndefined();
  expect(mocks.video).toHaveBeenCalledTimes(2);
 });
});
