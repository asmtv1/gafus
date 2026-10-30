import {describe,it,expect,vi} from 'vitest';
import {Hono} from 'hono';
import {assertChat2CloudCoreEnv,createChat2CloudCoreApp} from './chat2-v2-cloud-core.js';
const valid={
 NODE_ENV:'production' as const,
 CHAT2_CLOUD_CORE_MODE:'refactor-nonproduction',CHAT2_CORE_NONPROD_VERIFIED:'true',
 CHAT2_CLOUDRU_PROJECT_ID:'6777bd18-4ee9-4d15-bb1b-134f7a18ed3a',
 CHAT2_V2_CORE_ENABLED:'true',CHAT2_PROCESSOR_READY:'false',CHAT2_V2_MEDIA_ENABLED:'false',
 CHAT2_INTERNAL_HMAC_SECRET:'a'.repeat(64),CHAT2_CORE_BIND_ADDRESS:'0.0.0.0',PORT:'8080',
 DATABASE_URL:'postgresql://gafus_refactor_chat2_cloud:random_secret@db-refactor-chat2.private.test:5432/refactor_chat2_v2_cloud?schema=public',
 REDIS_URL:'rediss://redis-refactor-chat2.private.test:6380/2',
};
describe('Chat2 Refactor-only cloud Hono Core guard',()=>{
 it('requires exact isolated resources before imports/listeners',()=>{
  expect(()=>assertChat2CloudCoreEnv({...valid})).not.toThrow();
  const rejects=[
   {CHAT2_V2_MEDIA_ENABLED:'true'},{CHAT2_PROCESSOR_READY:'true'},
   {CHAT2_CLOUDRU_PROJECT_ID:'wrong'},
   {DATABASE_URL:'postgresql://gafus_refactor_chat2_cloud:x@127.0.0.1:5432/refactor_chat2_v2_cloud?schema=public'},
   {DATABASE_URL:'postgresql://gafus_refactor_chat2_cloud:x@db-refactor-chat2.private.test:5432/gafus1?schema=public'},
   {REDIS_URL:'redis://127.0.0.1:6379/0'},
   {REDIS_URL:'rediss://redis-refactor-chat2.private.test:6380/0'},
   {SMTP_PASSWORD:'production'},
   {CHAT2_INTERNAL_HMAC_SECRET:'short'},
  ];
  for(const override of rejects)expect(()=>assertChat2CloudCoreEnv({...valid,...override})).toThrow('CHAT2_CLOUD_CORE_ISOLATION_DENIED');
 });
 it('exposes only health and signed internal media namespace',async()=>{
  const core=new Hono();core.post('/claim',c=>c.json({jobs:[]}));
  const app=createChat2CloudCoreApp(core,vi.fn(async()=>undefined));
  expect((await app.request('/healthz')).status).toBe(200);
  expect((await app.request('/internal/chat2/media/jobs/claim',{method:'POST'})).status).toBe(200);
  for(const path of ['/api/v1/auth','/api/v1/users','/admin','/'])
   expect((await app.request(path)).status).toBe(404);
  expect((await app.request('/healthz')).headers.get('cache-control')).toBe('no-store');
 });
 it('returns 503 if DB or Redis is not ready',async()=>{
  const app=createChat2CloudCoreApp(new Hono(),async()=>{throw Error('DOWN')});
  expect((await app.request('/healthz')).status).toBe(503);
 });
});
