import {describe,it,expect,vi} from 'vitest';
import {createHash,createHmac} from 'node:crypto';
import {cleanupChat2ClientPhotoReservations,createChat2PhotoCleanupTick} from './chat2-photo-cleanup';
const secret='client-photo-cleanup-isolation-hmac-secret-2026';
describe('Chat2 image-only cleanup independent of Cloud video Jobs',()=>{
 it('does not contact Hono unless Chat2 core+media are enabled',async()=>{
  const http=vi.fn();
  expect(await cleanupChat2ClientPhotoReservations({},http as never)).toEqual({disabled:true});
  expect(http).not.toHaveBeenCalled();
 });
 it('signs strict internal cleanup HMAC and never calls Cloud.ru/photo Jobs',async()=>{
  const http=vi.fn(async(url:string,options:RequestInit)=>{
    expect(url).toBe('http://127.0.0.1:3001/internal/chat2/media/jobs/cleanup');
    expect(options.method).toBe('POST');
    expect(options.redirect).toBe('error');
    const headers=options.headers as Record<string,string>;
    const body=String(options.body);
    expect(JSON.parse(body)).toEqual({batchSize:1});
    const hash=createHash('sha256').update(body).digest('hex');
    const expected=createHmac('sha256',secret).update([
      'POST','/internal/chat2/media/jobs/cleanup',headers['x-chat2-timestamp'],
      headers['x-chat2-nonce'],hash,
    ].join('\n')).digest('hex');
    expect(headers['x-chat2-signature']).toBe(expected);
    return new Response(JSON.stringify({cleaned:false}),{status:200});
  });
  await expect(cleanupChat2ClientPhotoReservations({
    NODE_ENV:'test',GAFUS_LOCAL_ISOLATED_API:'1',CHAT2_V2_CORE_ENABLED:'true',
    CHAT2_V2_MEDIA_ENABLED:'true',CHAT2_INTERNAL_HMAC_SECRET:secret,
    CLOUDRU_MEDIA_JOBS_ENABLED:'false',
  },http as never)).resolves.toEqual({cleaned:false});
  expect(http).toHaveBeenCalledOnce();
 });
 it('production target is fixed private docker API, refuses arbitrary public-origin',async()=>{
  const http=vi.fn(async(url:string)=>{
    expect(url).toBe('http://api:3001/internal/chat2/media/jobs/cleanup');
    return new Response(JSON.stringify({cleaned:true}),{status:200});
  });
  await cleanupChat2ClientPhotoReservations({
    NODE_ENV:'production',GAFUS_LOCAL_ISOLATED_API:'1',CHAT2_V2_CORE_ENABLED:'true',
    CHAT2_V2_MEDIA_ENABLED:'true',CHAT2_INTERNAL_HMAC_SECRET:secret,
  },http as never);
  expect(http).toHaveBeenCalledOnce();
 });
 it('serializes overlapping retries; failure never triggers Cloud Jobs',async()=>{
  let release!:()=>void;
  const request=vi.fn(()=>new Promise<void>(resolve=>{release=resolve}));
  const tick=createChat2PhotoCleanupTick({request});
  const pending=tick();
  await expect(tick()).resolves.toEqual({skipped:true,cleaned:false});
  release();await expect(pending).resolves.toEqual({cleaned:true});
  expect(request).toHaveBeenCalledOnce();
  const fail=vi.fn(async()=>{throw Error('API_UNAVAILABLE')});
  await expect(createChat2PhotoCleanupTick({request:fail})()).resolves.toEqual({cleaned:false});
 });
});
