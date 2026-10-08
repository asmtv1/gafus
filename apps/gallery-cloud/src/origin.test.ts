import { randomBytes } from 'node:crypto';
import { describe,it,expect,vi } from 'vitest';
import { createGalleryOrigin } from './origin-handler';
import { signGalleryCdnUrl } from '@gafus/gallery-storage/cdn';
import type { GalleryObjectStore } from '@gafus/gallery-storage/objects';
const secret=randomBytes(32).toString('hex'), path='/albums/o/a/photos/p/full.webp';
function setup(size=4) {
 const bytes=Buffer.alloc(size); const meta={etag:'"'+'a'.repeat(32)+'"',bytes:size,contentType:'image/webp'};
 const objects={head:vi.fn(async()=>meta),read:vi.fn(async()=>({bytes,metadata:meta})),create:vi.fn(),delete:vi.fn()} as unknown as GalleryObjectStore;
 return {objects,origin:createGalleryOrigin({objects,secret}),event:{httpMethod:'GET',path,headers:{'x-gallery-origin-secret':secret}}};
}
describe('closed lightweight origin',()=>{
 it('requires secret even on valid final path',async()=>{const x=setup(); expect((await x.origin({...x.event,headers:{}})).statusCode).toBe(403);expect(x.objects.read).not.toHaveBeenCalled();});
 it.each(['/albums/o/a/incoming/u/source.jpg','/albums/o/a/photos/p/%2e%2e/full.webp','/albums/o/a/photos/p/full.webp/..','//albums/o/a/photos/p/full.webp'])('rejects path %s before storage',async path=>{const x=setup();expect((await x.origin({...x.event,path})).statusCode).toBe(400);expect(x.objects.read).not.toHaveBeenCalled();});
 it('returns browser no-store and binary base64',async()=>{const x=setup();const response=await x.origin(x.event);expect(response).toMatchObject({statusCode:200,isBase64Encoded:true,headers:{'Cache-Control':'private, no-store, max-age=0'}});expect(Buffer.from(response.body,'base64').length).toBe(4);});
 it.each(['GET','HEAD'])('fails closed over 1.75MB for %s',async httpMethod=>{const x=setup(1750001);expect((await x.origin({...x.event,httpMethod})).statusCode).toBe(502);});
 it('accepts maximum response below gateway 2.5MB limit',async()=>{const x=setup(1750000);const out=await x.origin(x.event);expect(out.statusCode).toBe(200);expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThan(2500000);});
 it('optional defense token rejects expiry; default permits CDN query stripping',async()=>{const x=setup();const now=1800000000000;const url=new URL(signGalleryCdnUrl('https://images.example.org',path.slice(1),new Date(now+120000),secret,now));const origin=createGalleryOrigin({objects:x.objects,secret,cdnSecret:secret,now:()=>now+120000});expect((await origin({...x.event,queryStringParameters:Object.fromEntries(url.searchParams)})).statusCode).toBe(403);expect((await x.origin(x.event)).statusCode).toBe(200);});
 it('maps storage failure to retryable 503 without details',async()=>{const x=setup();vi.mocked(x.objects.read).mockRejectedValue(Error('sensitive'));expect(await x.origin(x.event)).toMatchObject({statusCode:503,body:''});});
});
