import {describe,expect,it} from 'vitest';
import {isolatedLocalApiHostname} from './api-server-startup';
const alt:NodeJS.ProcessEnv={
 NODE_ENV:'development', API_HOST:'127.0.0.1', API_PORT:'3301',
 GAFUS_LOCAL_ISOLATED_API:'1', GAFUS_LOCAL_BROWSER_AUTH:'1',
 GAFUS_WEB1_ALT_HONO:'1',
 REDIS_URL:'redis://127.0.0.1:55927/1',
 DATABASE_URL:'postgresql://gafus_refactor_local_real:fixture-only@127.0.0.1:55921/gafus_refactor_real_work_20261024?schema=public',
 GALLERY_ENABLED:'false', FEED_ENABLED:'false', CDN_HEALTH_MONITOR_ENABLED:'false',
};
describe('WEB1 standalone Hono parity port remains isolated WORK-only',()=>{
 it('authorizes exact explicit, isolated nonproduction loopback only',()=>{
  expect(isolatedLocalApiHostname(alt)).toBe('127.0.0.1');
 });
 it('denies the alternate port without opt-in, or exposed host/prod mode',()=>{
  expect(()=>isolatedLocalApiHostname({...alt,GAFUS_WEB1_ALT_HONO:undefined})).toThrow();
  expect(()=>isolatedLocalApiHostname({...alt,NODE_ENV:'production'})).toThrow();
  expect(()=>isolatedLocalApiHostname({...alt,API_HOST:'0.0.0.0'})).toThrow();
  expect(()=>isolatedLocalApiHostname({...alt,API_PORT:'3303'})).toThrow();
 });
 it('denies production DB, non-WORK principals and outbound credentials',()=>{
  expect(()=>isolatedLocalApiHostname({...alt,DATABASE_URL:'postgresql://other:demo@127.0.0.1:55921/production?schema=public'})).toThrow();
  expect(()=>isolatedLocalApiHostname({...alt,RESEND_API_KEY:'forbidden'})).toThrow();
  expect(()=>isolatedLocalApiHostname({...alt,REDIS_URL:'redis://127.0.0.1:6379/0'})).toThrow();
 });
});
