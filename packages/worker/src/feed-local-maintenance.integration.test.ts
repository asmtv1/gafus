/** Opt-in disposable PostgreSQL; never talk to Cloud.ru, prod DB, or S3. */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createFeedMaintenance,createFeedStorageJobs} from '@gafus/core/services/feed';
import type {PrismaClient} from '@gafus/prisma';
import {createFeedLocalMaintenanceTick} from './feed-local-maintenance';
const uri=process.env.FEED_JANITOR_TEST_DATABASE_URL;
if(uri){
 const url=new URL(uri);
 if(!['postgresql:','postgres:'].includes(url.protocol)||
   !['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
   url.pathname!=='/gafus_retired_feed_janitor_test')
   throw Error('FEED_JANITOR_E2E_REQUIRES_ISOLATED_LOOPBACK_DB');
}
const loadPrismaClient=createRequire(resolve(process.cwd(),'../prisma/package.json'));
const Client=loadPrismaClient('@prisma/client').PrismaClient as new (options:{datasources:{db:{url:string}}})=>PrismaClient;
const db=uri?new Client({datasources:{db:{url:uri}}}):null;
(uri?describe:describe.skip)('Feed photo-retirement + S3 cleanup / real disposable PG',()=>{
 let time:Date;const owner='isolated_owner_20261105';
 beforeEach(()=>{time=new Date('2026-11-05T10:00:00Z')});
 afterEach(async()=>{
  await db!.feedStorageJob.deleteMany({where:{ownerId:owner}});
 });
 afterAll(async()=>db?.$disconnect());
 it('retires old photo claim, then deletes its orphan S3 bytes on existing Worker',async()=>{
  const key=`posts/${owner}/post1/incoming/upload1/source.jpg`;
  const objects=new Set([key]);
  const deleted=vi.fn(async(k:string)=>{objects.delete(k)});
  const exists=vi.fn(async(k:string)=>objects.has(k));
  const old=await db!.feedStorageJob.create({data:{
    id:'old_photo_job_'+Date.now(),dedupeKey:'legacy_photo_'+Date.now(),
    ownerId:owner,kind:'publish_photo',sourceKeys:[key],
    status:'pending',availableAt:time,
  }});
  const core=createFeedMaintenance({db:db!,now:()=>time});
  expect(await core.retireLegacyPhotoJobs(10)).toEqual({retiredPhotos:1});
  expect((await db!.feedStorageJob.findUniqueOrThrow({where:{id:old.id}}))).toMatchObject({
    status:'failed',errorCode:'PHOTO_JOB_RETIRED',
  });
  const queued=await db!.feedStorageJob.findUniqueOrThrow({
    where:{dedupeKey:`feed-retired-photo-cleanup:${old.id}`},
  });
  expect(queued).toMatchObject({kind:'delete_keys',status:'pending'});
  time=new Date(time.getTime()+180_000);
  const tick=createFeedLocalMaintenanceTick({
    db:db!,jobs:createFeedStorageJobs({db:db!,now:()=>time}),maintenance:core,
    objects:{delete:deleted,exists},now:()=>time.getTime(),
  });
  await expect(tick()).resolves.toEqual({processed:1});
  expect(objects.has(key)).toBe(false);
  expect(deleted).toHaveBeenCalledExactlyOnceWith(key,expect.any(AbortSignal));
  expect(exists).toHaveBeenCalledExactlyOnceWith(key,expect.any(AbortSignal));
  expect((await db!.feedStorageJob.findUniqueOrThrow({where:{id:queued.id}})).status)
    .toBe('completed');
  // A second minute does not launch anything or re-process old pending image.
  await expect(tick()).resolves.toEqual({processed:0});
 });
});
