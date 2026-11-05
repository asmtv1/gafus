import {describe,expect,it} from 'vitest';
import {questionsV2CleanupKeys} from './questionsV2Cleanup';
const ownerId='owner_1',mediaId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const base=`questions/v2/${ownerId}/${mediaId}/incoming`;
const record={ownerId,mediaId,sourceKey:`${base}/source.webp`,
  sourceMime:'image/webp',cleanupKind:'SOURCE' as const};
describe('Questions exact owner-derived cleanup keys',()=>{
 it('SOURCE uses only stage keys; ALL uses stage plus final variants',()=>{
  expect(questionsV2CleanupKeys(record)).toEqual([`${base}/source.webp`,`${base}/small.webp`]);
  expect(questionsV2CleanupKeys({...record,cleanupKind:'ALL'})).toEqual([
    `${base}/source.webp`,`${base}/small.webp`,
    `questions/uploads/questions/v2/${ownerId}/${mediaId}/v1/image/s.webp`,
    `questions/uploads/questions/v2/${ownerId}/${mediaId}/v1/image/m.webp`,
  ]);
 });
 it('legacy JPEG cleanup does not fabricate a small staging key',()=>{
  expect(questionsV2CleanupKeys({...record,sourceKey:`${base}/source.jpg`,
    sourceMime:'image/jpeg'})).toEqual([`${base}/source.jpg`]);
 });
 it('rejects arbitrary keys, owner changes, malformed media IDs and unsupported kinds',()=>{
  for(const bad of [
    {...record,sourceKey:'questions/v2/other/source.webp'},
    {...record,ownerId:'../other'},
    {...record,mediaId:'not_uuid'},
    {...record,cleanupKind:'OTHER'},
    {...record,sourceMime:'application/pdf'},
  ])expect(()=>questionsV2CleanupKeys(bad as typeof record)).toThrow();
 });
});
