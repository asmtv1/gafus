import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import { createGalleryObjectStore, objectMd5, MAX_OBJECT_BYTES } from './objects';
const key='albums/o/a/photos/p/full.webp', bytes=Buffer.from('webp-test');
const config={bucket:'gallery-private-test',endpoint:'https://storage.yandexcloud.net',accessKeyId:'test',secretAccessKey:'test'};
const meta={ETag:objectMd5(bytes),ContentLength:bytes.length,ContentType:'image/webp'};
function store(send: ReturnType<typeof vi.fn>) { return createGalleryObjectStore(config,{send} as unknown as S3Client); }
describe('fail-closed object snapshots and immutable writes',()=>{
 it('HEAD returns null only for actual 404',async()=>{
   const send=vi.fn().mockRejectedValueOnce({$metadata:{httpStatusCode:404}}).mockRejectedValueOnce({$metadata:{httpStatusCode:403}}).mockRejectedValueOnce(Error('offline'));
   const s=store(send); expect(await s.head(key)).toBeNull(); await expect(s.head(key)).rejects.toMatchObject({$metadata:{httpStatusCode:403}}); await expect(s.head(key)).rejects.toThrow('offline');
 });
 it('normalizes unquoted snapshot for conditional GET',async()=>{
   const send=vi.fn().mockResolvedValue({...meta,ETag:meta.ETag.slice(1,-1),Body:Readable.from([bytes])});
   expect((await store(send).read(key,meta.ETag.slice(1,-1))).metadata.etag).toBe(meta.ETag);
   expect(send.mock.calls[0][0].input.IfMatch).toBe(meta.ETag);
 });
 it('destroys changed snapshot before consuming bytes',async()=>{
   const body=Readable.from([bytes]); const destroy=vi.spyOn(body,'destroy');
   const send=vi.fn().mockResolvedValue({...meta,ETag:'"'+'0'.repeat(32)+'"',Body:body});
   await expect(store(send).read(key,meta.ETag)).rejects.toThrow('SOURCE_CHANGED'); expect(destroy).toHaveBeenCalled();
 });
 it('bounds streamed bytes independently of ContentLength',async()=>{
   const body=Readable.from([Buffer.alloc(MAX_OBJECT_BYTES+1)]); const send=vi.fn().mockResolvedValue({...meta,Body:body});
   await expect(store(send).read(key)).rejects.toThrow('IMAGE_SIZE'); expect(body.destroyed).toBe(true);
 });
 it('rejects origin oversize metadata before reading the body',async()=>{
   const body=Readable.from([bytes]); const send=vi.fn().mockResolvedValue({...meta,ContentLength:1_750_001,Body:body});
   await expect(store(send).read(key,undefined,undefined,1_750_000)).rejects.toThrow('OBJECT_BYTE_LIMIT'); expect(body.destroyed).toBe(true);
 });
 it('bounds origin streaming despite dishonest metadata',async()=>{
   const body=Readable.from([Buffer.alloc(1_750_001)]); const send=vi.fn().mockResolvedValue({...meta,Body:body});
   await expect(store(send).read(key,undefined,undefined,1_750_000)).rejects.toThrow('IMAGE_SIZE'); expect(body.destroyed).toBe(true);
 });
 it('uses create-if-absent and verifies persisted result',async()=>{
   const send=vi.fn().mockRejectedValueOnce({$metadata:{httpStatusCode:404}}).mockResolvedValueOnce({ETag:meta.ETag}).mockResolvedValueOnce(meta);
   expect((await store(send).create(key,bytes,'image/webp')).etag).toBe(meta.ETag);
   expect(send.mock.calls[1][0].input).toMatchObject({IfNoneMatch:'*',ContentMD5:Buffer.from(meta.ETag.slice(1,-1),'hex').toString('base64'),CacheControl:'no-store'});
 });
 it('identical retry skips PUT',async()=>{
   const send=vi.fn().mockResolvedValue(meta); await store(send).create(key,bytes,'image/webp'); expect(send).toHaveBeenCalledTimes(1);
 });
 it('existing conflicting output is never overwritten',async()=>{
   const send=vi.fn().mockResolvedValue({...meta,ContentLength:99}); await expect(store(send).create(key,bytes,'image/webp')).rejects.toThrow('IMMUTABLE_CONFLICT'); expect(send).toHaveBeenCalledTimes(1);
 });
 it('conditional race verifies identical winner without overwriting',async()=>{
   const send=vi.fn().mockRejectedValueOnce({$metadata:{httpStatusCode:404}}).mockRejectedValueOnce({$metadata:{httpStatusCode:412}}).mockResolvedValueOnce(meta);
   await expect(store(send).create(key,bytes,'image/webp')).resolves.toMatchObject({etag:meta.ETag}); expect(send).toHaveBeenCalledTimes(3);
 });
 it('aborted lease prevents a PUT',async()=>{
   const controller=new AbortController(); controller.abort(); const send=vi.fn().mockRejectedValue({$metadata:{httpStatusCode:404}});
   await expect(store(send).create(key,bytes,'image/webp',controller.signal)).rejects.toThrow('LEASE_EXPIRED'); expect(send).toHaveBeenCalledTimes(1);
 });
});
