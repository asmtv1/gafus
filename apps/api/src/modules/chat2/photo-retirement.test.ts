import {describe,expect,it,vi} from 'vitest';
import {createChat2V2Queue} from './media-v2-jobs';
describe('Chat2 Cloud photo Job retirement',()=>{
 it('converts queued and lease-expired image Jobs to terminal S3 cleanup without touching video',async()=>{
  const updateMany=vi.fn(async()=>({count:1}));
  const db={chat2V2MediaTask:{updateMany,findFirst:vi.fn(async()=>null)}};
  const result=await createChat2V2Queue({database:db as never,
    now:()=>new Date('2026-11-05T12:00:00Z'),deleteObjects:vi.fn()}).cleanupPending();
  expect(result).toEqual({cleaned:false});
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{status:'QUEUED',sourceMime:{startsWith:'image/'}},
   data:expect.objectContaining({status:'FAILED',errorCode:'PHOTO_JOB_RETIRED',cleanupKind:'ALL'}),
  }));
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({status:'PROCESSING',sourceMime:{startsWith:'image/'},
    leaseUntil:expect.any(Object)}),
   data:expect.objectContaining({status:'FAILED',errorCode:'PHOTO_JOB_RETIRED'}),
  }));
  expect(updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
   where:{status:'QUEUED',sourceMime:{startsWith:'video/'}},
  }));
 });
});
