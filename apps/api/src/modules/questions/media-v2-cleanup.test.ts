import { describe,expect,it,vi } from 'vitest';
import {randomUUID} from 'node:crypto';
import {createQuestionsV2Queue} from './media-v2-jobs';
const mediaId=randomUUID(),ownerId='user_123';
const initial=new Date('2026-11-05T12:00:00Z');
function setup(kind:'SOURCE'|'ALL'='SOURCE',status='READY'){
  let at=initial;
  const task={mediaId,ownerId,status,sourceMime:'image/webp',
    sourceKey:`questions/v2/${ownerId}/${mediaId}/incoming/source.webp`,
    createdAt:new Date(initial.getTime()-180_000),
    cleanupKind:kind,cleanupAttempts:1,cleanupLeaseUntil:null,
    cleanupToken:null,cleanupCompletedAt:null,
  };
  const updateMany=vi.fn(async(_args:unknown)=>({count:1}));
  const findFirst=vi.fn(async()=>task);
  const db={questionV2MediaTask:{
    updateMany,findMany:vi.fn(async()=>[]),findFirst,
  },questionPhoto:{findMany:vi.fn(async()=>[])},$queryRaw:vi.fn(async()=>[])};
  const queue=createQuestionsV2Queue({database:db as never,now:()=>at});
  return {task,db,queue,updateMany,findFirst,advance(ms:number){at=new Date(at.getTime()+ms)}};
}
describe('Questions S3 delete lease and database receipts, NO Hono S3 DELETE',()=>{
 it('claims a SOURCE key from READY task without touching S3',async()=>{
  const s=setup();
  const result=await s.queue.claimCleanup();
  expect(result.job).toMatchObject({mediaId,ownerId,
    sourceKey:s.task.sourceKey,sourceMime:'image/webp',cleanupKind:'SOURCE',
    cleanupToken:expect.any(String),cleanupLeaseUntil:expect.any(String)});
  expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where:expect.objectContaining({mediaId,status:'READY',cleanupKind:'SOURCE'}),
    data:expect.objectContaining({cleanupAttempts:{increment:1},cleanupToken:expect.any(String)}),
  }));
 });
 it('filters invalid READY+ALL state in the database query, avoiding starvation of valid rows',async()=>{
  const s=setup('SOURCE','READY');
  await s.queue.claimCleanup();
  expect(s.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where:expect.objectContaining({AND:expect.arrayContaining([
      {OR:[{status:'READY',cleanupKind:'SOURCE'},
        {status:{in:['FAILED','EXPIRED']},cleanupKind:'ALL'}]},
    ])}),
  }));
 });
 it('rejects READY task with ALL delete to protect published final objects',async()=>{
  const s=setup('ALL','READY');
  expect(await s.queue.claimCleanup()).toEqual({job:null});
  expect(s.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
    data:expect.objectContaining({cleanupAttempts:{increment:1}}),
  }));
 });
 it('schedules second SOURCE DELETE after replayable signed S3 POST expires',async()=>{
  const s=setup();
  const result=await s.queue.completeCleanup(mediaId,randomUUID(),s.task.cleanupKind);
  expect(result.accepted).toBe(true);
  expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data:expect.objectContaining({cleanupNextAt:expect.any(Date),
      cleanupToken:null,cleanupLeaseUntil:null}),
  }));
  const calls=s.updateMany.mock.calls;
  expect((calls.at(-1)?.[0] as {data:{cleanupNextAt:Date}}).data.cleanupNextAt.getTime())
    .toBe(s.task.createdAt.getTime()+11*60_000);
 });
 it('records terminal cleanup only after replay window or ALL deletion',async()=>{
  const s=setup('ALL','FAILED');
  expect(await s.queue.completeCleanup(mediaId,randomUUID(),s.task.cleanupKind)).toEqual({accepted:true});
  expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data:expect.objectContaining({cleanupKind:null,cleanupCompletedAt:initial}),
  }));
 });
 it('releases an S3 failure with retry backoff without marking cleanup completed',async()=>{
  const s=setup();
  expect(await s.queue.failCleanup(mediaId,randomUUID(),s.task.cleanupKind)).toEqual({accepted:true});
  expect(s.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data:expect.objectContaining({cleanupNextAt:expect.any(Date),cleanupToken:null,
      cleanupLeaseUntil:null}),
  }));
  expect(s.updateMany.mock.calls.at(-1)?.[0]).not.toMatchObject({
    data:{cleanupCompletedAt:expect.any(Date)},
  });
 });
 it('a SOURCE receipt cannot acknowledge an ALL delete after moderation or removal',async()=>{
  const s=setup('ALL','EXPIRED');
  expect(await s.queue.completeCleanup(mediaId,randomUUID(),'SOURCE')).toEqual({accepted:false});
  expect(await s.queue.failCleanup(mediaId,randomUUID(),'SOURCE')).toEqual({accepted:false});
  expect(s.updateMany).not.toHaveBeenCalled();
 });
 it('refuses to acknowledge a stale/unleased cleanup token',async()=>{
  const s=setup();s.findFirst.mockResolvedValueOnce(null as never);
  expect(await s.queue.completeCleanup(mediaId,randomUUID(),s.task.cleanupKind)).toEqual({accepted:false});
  expect(s.updateMany).not.toHaveBeenCalled();
 });
});
