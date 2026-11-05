import {describe,expect,it,vi} from 'vitest';
import {createFeedMaintenance} from './maintenance';
const now=new Date('2026-11-05T12:00:00Z');
const job={id:'legacy_job1',dedupeKey:'legacy_photo_job1',ownerId:'owner1',
 postId:'post1',mediaId:'media1',uploadId:'upload1',kind:'publish_photo',
 sourceKeys:['posts/owner1/post1/incoming/upload1/source.jpg'],targetKeys:[],
 status:'pending',leaseUntil:null};
function setup(ready=false){
 const update=vi.fn(async()=>({count:1}));
 const upsert=vi.fn(async()=>({}));
 const asset={id:job.mediaId,status:ready?'ready':'processing',ownerId:job.ownerId,postId:job.postId};
 const upload={id:job.uploadId,status:ready?'ready':'uploaded',purpose:'post',
  postExpiresAt:new Date(now.getTime()+600_000),
  reservationExpiresAt:new Date(now.getTime()+600_000)};
 const tx={
  $queryRaw:vi.fn(async()=>[{id:'post1'}]),
  feedStorageJob:{updateMany:update,upsert},
  feedMediaAsset:{findUnique:vi.fn(async()=>asset),updateMany:vi.fn(async()=>({count:1}))},
  feedUpload:{findUnique:vi.fn(async()=>upload),updateMany:vi.fn(async()=>({count:1}))},
  feedPost:{findUnique:vi.fn(async()=>({id:'post1',version:1,activeRevisionId:null,deletedAt:null})),
   updateMany:vi.fn(async()=>({count:1}))},
  feedPostRevision:{updateMany:vi.fn(async()=>({count:1}))},
 };
 const db={feedStorageJob:{findMany:vi.fn(async()=>[job])},
  $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx))};
 return {db,tx,run:()=>createFeedMaintenance({db:db as never,now:()=>now}).retireLegacyPhotoJobs(2)};
}
describe('Feed historical photo jobs: Core retirement instead of Cloud',()=>{
 it('terminalizes a queued Sharp publish job and schedules bounded source/output cleanup',async()=>{
  const s=setup();
  await expect(s.run()).resolves.toEqual({retiredPhotos:1});
  expect(s.tx.feedStorageJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({kind:{in:['publish_photo','copy_album']}}),
   data:expect.objectContaining({status:'failed',errorCode:'PHOTO_JOB_RETIRED'}),
  }));
  expect(s.tx.feedMediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   data:{status:'failed',errorCode:'PHOTO_JOB_RETIRED'},
  }));
  expect(s.tx.feedPostRevision.updateMany).toHaveBeenCalledOnce();
  expect(s.tx.feedPost.updateMany).toHaveBeenCalledOnce();
  expect(s.tx.feedStorageJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
   create:expect.objectContaining({kind:'delete_keys',
    sourceKeys:expect.arrayContaining(['posts/owner1/post1/incoming/upload1/source.jpg',
      'media/v2/media1/v1/image/l.webp']),
   }),
  }));
 });
 it('retires the old Gallery-to-Feed copy_album job without trying to start a Cloud photo processor',async()=>{
  const s=setup();
  s.db.feedStorageJob.findMany.mockResolvedValueOnce([{...job,kind:'copy_album'}]);
  await expect(s.run()).resolves.toEqual({retiredPhotos:1});
  expect(s.tx.feedStorageJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({kind:{in:['publish_photo','copy_album']}}),
   data:expect.objectContaining({status:'failed',errorCode:'PHOTO_JOB_RETIRED'}),
  }));
  expect(s.tx.feedStorageJob.upsert).toHaveBeenCalledOnce();
 });
 it('never removes READY client-published images from stale legacy task',async()=>{
  const s=setup(true);
  await expect(s.run()).resolves.toEqual({retiredPhotos:1});
  expect(s.tx.feedStorageJob.upsert).not.toHaveBeenCalled();
  expect(s.tx.feedMediaAsset.updateMany).not.toHaveBeenCalled();
  expect(s.tx.feedPost.updateMany).not.toHaveBeenCalled();
 });
 it('enforces bounded reconciliation batch',async()=>{
  const s=setup();
  await expect(createFeedMaintenance({db:s.db as never}).retireLegacyPhotoJobs(51))
   .rejects.toThrow('INVALID_MAINTENANCE_LIMIT');
 });
});
