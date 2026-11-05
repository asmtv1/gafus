import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createQuestionsV2Queue} from './media-v2-jobs';
describe('Questions Cloud photo Job retirement',()=>{
 it('settles pre-cutover QUEUED image and expired processing lease, independent of Cloud',async()=>{
  const at=new Date('2026-11-05T12:00:00Z');
  const old={mediaId:randomUUID(),createdAt:new Date(at.getTime()-3_600_000),
   leaseUntil:new Date(at.getTime()-900_000)};
  const updateMany=vi.fn(async()=>({count:1}));
  const db={
   questionV2MediaTask:{updateMany,
    findMany:vi.fn(async(args:{where?:{OR?:unknown[]}})=>
      args.where?.OR?.some(row=>typeof row==='object'&&row!==null&&
       ('status' in row))?[old]:[]),
    findFirst:vi.fn(async()=>null)},
   questionPhoto:{findMany:vi.fn(async()=>[])},
   $queryRaw:vi.fn(async()=>[]),
  };
  expect(await createQuestionsV2Queue({database:db as never,now:()=>at,
    }).claimCleanup()).toEqual({job:null});
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({mediaId:old.mediaId,OR:[
    {status:'QUEUED'},{status:'PROCESSING',leaseUntil:{lt:at}}]}),
   data:expect.objectContaining({status:'FAILED',errorCode:'PHOTO_JOB_RETIRED',cleanupKind:'ALL',
    cleanupNextAt:expect.any(Date)}),
  }));
 });
});
