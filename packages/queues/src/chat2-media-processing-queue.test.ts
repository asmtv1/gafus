import {describe,it,expect,vi} from "vitest";
const {add}=vi.hoisted(()=>({add:vi.fn().mockResolvedValue(undefined)}));
vi.mock("./redis.js",()=>({connection:{}}));
vi.mock("bullmq",()=>({Queue:class{add=add;}}));
import {enqueueChat2MediaProcessing,CHAT2_MEDIA_PROCESSING_QUEUE_NAME} from "./chat2-media-processing-queue.js";
const id="8dc418f6-97da-42be-ab73-b3c172c95ccd";
describe("Chat2 Media V2 BullMQ wake only",()=>{
 it.each(["photo","video"] as const)("deduplicates %s wake per mediaId with exponential retry",async kind=>{
  add.mockClear();await enqueueChat2MediaProcessing(id,kind);await enqueueChat2MediaProcessing(id,kind);
  expect(CHAT2_MEDIA_PROCESSING_QUEUE_NAME).toBe("chat2-media-v2-processing-trigger");
  expect(add).toHaveBeenCalledTimes(2);
  expect(add.mock.calls[0]).toEqual(["wake",{mediaId:id,kind},{
   jobId:`chat2-${id}`,attempts:5,backoff:{type:"exponential",delay:3000},
   removeOnComplete:true,removeOnFail:{count:500},
  }]);
  expect(add.mock.calls[1]?.[2]?.jobId).toBe(add.mock.calls[0]?.[2]?.jobId);
 });
 it("rejects forged IDs/unknown media types before Redis is touched",async()=>{
  add.mockClear();await expect(enqueueChat2MediaProcessing("../secrets","photo")).rejects.toThrow("CHAT2_INVALID_WAKEUP");
  await expect(enqueueChat2MediaProcessing(id,"unknown" as never)).rejects.toThrow("CHAT2_INVALID_WAKEUP");
  expect(add).not.toHaveBeenCalled();
 });
});
