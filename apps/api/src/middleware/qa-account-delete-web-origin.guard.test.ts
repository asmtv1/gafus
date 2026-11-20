import {afterEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import {isIsolatedQaDeleteWebOrigin} from './cors.js';
import {setBrowserSession,isTrustedBrowserOrigin} from '../lib/browser-auth.js';
const run='aabbcc112233';
const port='45991';
const origin=(role:string)=>`http://qa-delete-${role}-${run}.localhost:${port}`;
function isolate(){
 const env={NODE_ENV:'test',GAFUS_QA_ACCOUNT_DELETE_WEB:'1',GAFUS_LOCAL_ISOLATED_API:'1',
  API_HOST:'127.0.0.1',FEED_ENABLED:'false',GALLERY_ENABLED:'false',
  GAFUS_QA_ACCOUNT_DELETE_RUN:run,GAFUS_QA_ACCOUNT_DELETE_WEB_PORT:port,
  DATABASE_URL:'postgresql://qahttp@127.0.0.1:47011/archqa_delete_abcdefabcdef?schema=public',
  REDIS_URL:'redis://127.0.0.1:47012/0'};
 for(const [name,value] of Object.entries(env))vi.stubEnv(name,value);
}
afterEach(()=>vi.unstubAllEnvs());
describe('one-off original Web account delete Hono origin guard',()=>{
 it('accepts exactly two random disposable same-profile Chrome hosts and no third-party origin',()=>{
  isolate();
  expect(isIsolatedQaDeleteWebOrigin(origin('owner'))).toBe(true);
  expect(isIsolatedQaDeleteWebOrigin(origin('other'))).toBe(true);
  for(const bad of [origin('a'),origin('admin'),origin('owner').replace(port,'45992'),
    origin('owner')+'.evil.test','http://127.0.0.1:5173','http://localhost:3000','https://gafus.ru'])
    expect(isIsolatedQaDeleteWebOrigin(bad)).toBe(false);
 });
 it('denies production, normal development, wrong database and remote Redis',()=>{
  for(const [key,value] of [
    ['NODE_ENV','production'],['NODE_ENV','development'],
    ['GAFUS_QA_ACCOUNT_DELETE_WEB','0'],['GAFUS_LOCAL_ISOLATED_API','0'],
    ['DATABASE_URL','postgresql://qahttp@127.0.0.1:47011/a_real_db'],
    ['DATABASE_URL','postgresql://qahttp@185.239.51.125:5432/archqa_delete_abcdefabcdef'],
    ['REDIS_URL','redis://127.0.0.1:6379/1'],
    ['GAFUS_QA_ACCOUNT_DELETE_RUN','wrong'],
    ['GALLERY_ENABLED','true'],
  ]){
    isolate();vi.stubEnv(key,value);
    expect(isIsolatedQaDeleteWebOrigin(origin('owner'))).toBe(false);
    vi.unstubAllEnvs();
  }
 });
 it('preserves HttpOnly and SameSite/Path; Secure stays ON outside disposable QA',async()=>{
  isolate();const app=new Hono();app.post('/api/v1/synthetic',c=>{
    const trusted=isTrustedBrowserOrigin(c);
    setBrowserSession(c,'synthetic-qa-access','synthetic-qa-refresh');
    return c.json({trusted});
  });
  const qa=await app.request(origin('owner')+'/api/v1/synthetic',{method:'POST',headers:{Origin:origin('owner')}});
  expect((await qa.json()).trusted).toBe(true);
  expect(qa.headers.getSetCookie()).toHaveLength(2);
  for(const c of qa.headers.getSetCookie()){
    expect(c).toMatch(/HttpOnly/i);expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\/api\/v1/i);expect(c).not.toMatch(/; Secure/i);
  }
  vi.stubEnv('NODE_ENV','production');
  const real=await app.request(origin('owner')+'/api/v1/synthetic',{method:'POST',headers:{Origin:origin('owner')}});
  expect((await real.json()).trusted).toBe(false);
  expect(real.headers.getSetCookie().every(c=>/; Secure/i.test(c))).toBe(true);
 });
});
