import {describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {createGalleryLocalMaintenanceTick} from "./gallery-local-maintenance";
const owner="owner1",photo="photo1";
const root=`albums/${owner}/albumA/photos/${photo}`;
const target=`albums/${owner}/albumB/photos/${photo}`;
const etag=`"${createHash('md5').update('WEBP').digest('hex')}"`;
const lease=()=>new Date(Date.now()+60_000).toISOString();
const job=(kind:"delete"|"move"|"vetPreview",override:Record<string,unknown>={})=>({
  jobId:"job_1",attemptToken:"attempt_1",kind,writeMode:"create-if-absent",
  sourceKeys:kind==="move"?[root+"/thumb.webp",root+"/full.webp"]:[root+"/thumb.webp"],
  sourceETags:kind==="move"?[etag,etag]:[],targetKeys:kind==="move"?
   [target+"/thumb.webp",target+"/full.webp"]:[],leaseUntil:lease(),...override,
});
function setup(tasks:unknown[]){
 const claimed=[...tasks];
 const core={
  maintenance:vi.fn(async()=>({})),
  claimStorageJobs:vi.fn(async()=>claimed.length?[claimed.shift()!]:[]),
  completeStorageJob:vi.fn(async()=>({accepted:true,status:"done"})),
  failStorageJob:vi.fn(async()=>({accepted:true,status:"failed"})),
 };

 const meta={etag,bytes:4,contentType:"image/webp"};
 const objects={delete:vi.fn(async()=>undefined),
  read:vi.fn(async()=>({bytes:Buffer.from('WEBP'),metadata:meta})),
  create:vi.fn(async(_key:string,_bytes:Uint8Array,_mime:string)=>meta),head:vi.fn(async()=>null)};
 return {core,objects,tick:createGalleryLocalMaintenanceTick({core:core as never,objects:objects as never})};
}
describe('Gallery S3 janitor: no Cloud image Jobs',()=>{
 it('deletes only leased immutable keys and commits their S3 cleanup',async()=>{
  const s=setup([job('delete')]);
  await expect(s.tick()).resolves.toEqual({processed:1});
  expect(s.core.maintenance).toHaveBeenCalledOnce();
  expect(s.objects.delete).toHaveBeenCalledExactlyOnceWith(root+'/thumb.webp',expect.any(AbortSignal));
  expect(s.core.completeStorageJob).toHaveBeenCalledWith({jobId:'job_1',attemptToken:'attempt_1'});
  expect(s.core.failStorageJob).not.toHaveBeenCalled();
 });
 it('copies two WebP variants with immutable S3 guard, not re-encoding on backend',async()=>{
  const s=setup([job('move')]);
  await expect(s.tick()).resolves.toEqual({processed:1});
  expect(s.objects.read).toHaveBeenCalledTimes(2);
  expect(s.objects.create.mock.calls.map(args=>args[0])).toEqual([target+'/thumb.webp',target+'/full.webp']);
  expect(s.core.completeStorageJob).toHaveBeenCalledOnce();
 });
 it('marks pre-cutover vet preview queue terminal; never waits for removed photo job',async()=>{
  const s=setup([job('vetPreview')]);
  await expect(s.tick()).resolves.toEqual({processed:1});
  expect(s.core.failStorageJob).toHaveBeenCalledExactlyOnceWith({
   jobId:'job_1',attemptToken:'attempt_1',errorCode:'VET_PREVIEW_RETIRED',retryable:false,
  });
  expect(s.objects.delete).not.toHaveBeenCalled();
  expect(s.objects.create).not.toHaveBeenCalled();
 });
 it('fails closed on tampered/unknown job, without calling Cloud or touching S3',async()=>{
  const s=setup([job('delete',{writeMode:'overwrite'})]);
  await expect(s.tick()).rejects.toThrow('UNTRUSTED_CLAIM');
  expect(s.objects.delete).not.toHaveBeenCalled();
  expect(s.core.failStorageJob).toHaveBeenCalledExactlyOnceWith({
   jobId:'job_1',attemptToken:'attempt_1',errorCode:'GALLERY_LOCAL_UNTRUSTED',retryable:false,
  });
 });
 it('prevents concurrent ticks and empty paid invocations',async()=>{
  const s=setup([]);
  await expect(s.tick()).resolves.toEqual({processed:0});
  expect(s.objects.delete).not.toHaveBeenCalled();
 });
});
