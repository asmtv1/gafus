import {describe,expect,it,vi} from 'vitest';
import {createFeedLocalMaintenanceTick} from './feed-local-maintenance';
const lease=()=>new Date(Date.now()+150_000).toISOString();
const key='posts/user1/post1/incoming/upload1/source.webp';
function setup(options?:{empty?:boolean;badKey?:boolean}){
 const row={id:'job1',ownerId:'user1',kind:'delete_keys'} as const;
 const task={id:row.id,attemptToken:'attempt1',kind:row.kind,
   sourceKeys:options?.badKey?['external/key']:[key],targetKeys:[],leaseUntil:lease()};
 const db={feedStorageJob:{findMany:vi.fn(async()=>options?.empty?[]:[row])}};
 const maintenance={run:vi.fn(async()=>({retiredPhotos:0}))};
 const jobs={
  claim:vi.fn(async()=>[task]),
  complete:vi.fn(async()=>({accepted:true})),
  fail:vi.fn(async()=>({accepted:true})),
 };
 const objects={delete:vi.fn(async()=>undefined),exists:vi.fn(async()=>false)};
 return {db,maintenance,jobs,objects,
  tick:createFeedLocalMaintenanceTick({db:db as never,maintenance:maintenance as never,
    jobs:jobs as never,objects})};
}
describe('Feed cleanup on existing Worker, not Cloud.video',()=>{
 it('deletes leased S3 object, verifies HEAD and confirms PostgreSQL receipt',async()=>{
  const s=setup();
  await expect(s.tick()).resolves.toEqual({processed:1});
  expect(s.maintenance.run).toHaveBeenCalledExactlyOnceWith(10);
  expect(s.jobs.claim).toHaveBeenCalledWith(1,undefined,{
   jobId:'job1',ownerId:'user1',kind:'delete_keys'});
  expect(s.objects.delete).toHaveBeenCalledExactlyOnceWith(key,expect.any(AbortSignal));
  expect(s.objects.exists).toHaveBeenCalledExactlyOnceWith(key,expect.any(AbortSignal));
  expect(s.jobs.complete).toHaveBeenCalledWith('job1','attempt1');
  expect(s.jobs.fail).not.toHaveBeenCalled();
 });
 it('rejects untrusted S3 key before deletion, and releases the lease to retry',async()=>{
  const s=setup({badKey:true});
  await expect(s.tick()).rejects.toThrow('UNTRUSTED_FEED_KEY');
  expect(s.objects.delete).not.toHaveBeenCalled();
  expect(s.jobs.fail).toHaveBeenCalledWith('job1','attempt1','FEED_LOCAL_CLEANUP_RETRY');
 });
 it('retries ambiguous S3 deletion without falsely acknowledging PG',async()=>{
  const s=setup();s.objects.exists.mockResolvedValueOnce(true);
  await expect(s.tick()).rejects.toThrow('FEED_LOCAL_DELETE_NOT_CONFIRMED');
  expect(s.jobs.complete).not.toHaveBeenCalled();
  expect(s.jobs.fail).toHaveBeenCalledOnce();
 });
 it('empty queue calls maintenance without any Cloud or S3',async()=>{
  const s=setup({empty:true});
  await expect(s.tick()).resolves.toEqual({processed:0});
  expect(s.jobs.claim).not.toHaveBeenCalled();
  expect(s.objects.delete).not.toHaveBeenCalled();
 });
});
