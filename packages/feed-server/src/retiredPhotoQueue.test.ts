import { describe, expect, it, vi } from "vitest";
import { createRetiredFeedPhotoQueueTick } from "./retiredPhotoQueue.js";
describe("retired photo queue is terminal and never invokes Cloud image jobs",()=>{
 it("claims only stale photo and album-copy tasks in small bounded scans",async()=>{
  const findMany=vi.fn().mockResolvedValue([]);
  const db={feedStorageJob:{findMany}} as never;
  const tick=createRetiredFeedPhotoQueueTick({database:db,now:()=>new Date("2026-11-07T10:00:00Z")});
  expect(await tick()).toEqual({retired:0});
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({kind:{in:["publish_photo","copy_album"]}}),
   take:20,
  }));
 });
 it("CAS marks photo job and its attached asset failed, never touches video",async()=>{
  const updateMany=vi.fn().mockResolvedValue({count:1});
  const findMany=vi.fn().mockResolvedValue([{id:"photo-1",kind:"publish_photo",uploadId:"upload-1",mediaId:"media-1"}]);
  const db={
   feedStorageJob:{findMany},
   $transaction: async (callback:(tx:unknown)=>Promise<unknown>)=>
     callback({feedStorageJob:{updateMany},feedUpload:{updateMany},
       feedMediaAsset:{updateMany},feedPostRevision:{updateMany}}),
  } as never;
  const tick=createRetiredFeedPhotoQueueTick({database:db});
  expect(await tick()).toEqual({retired:1});
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({id:"photo-1",kind:{in:["publish_photo","copy_album"]}}),
   data:expect.objectContaining({status:"failed",errorCode:"PHOTO_JOB_RETIRED"}),
  }));
 });
});
