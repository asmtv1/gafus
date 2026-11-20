/** Gated *test-only* Chrome cookie-host origin: no change to production/development CORS. */
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import {isIsolatedQaCookieOrigin} from './cors.js';
import {isTrustedBrowserOrigin,setBrowserSession} from '../lib/browser-auth.js';
const run='abcdef123456';
const port='41357';
const origin=(role:string)=>`http://qa-${role}-${run}.localhost:${port}`;
function gated(){
 const env:Record<string,string>={
   NODE_ENV:'test',GAFUS_QA_COOKIE_BROWSER_ACCEPTANCE:'1',
   GAFUS_LOCAL_ISOLATED_API:'1',API_HOST:'127.0.0.1',
   FEED_ENABLED:'false',GALLERY_ENABLED:'false',
   GAFUS_QA_COOKIE_RUN:run,GAFUS_QA_COOKIE_PORT:port,
   DATABASE_URL:'postgresql://qahttp@127.0.0.1:42354/archqa_cookie_ab12cd34ef56?schema=public',
   REDIS_URL:'redis://127.0.0.1:42355/0',
 };
 for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);
}
afterEach(()=>vi.unstubAllEnvs());
describe('own Chrome *.localhost QA test-only guard',()=>{
 it('allows exactly the three disposable localhost hosts when ALL isolation keys match',()=>{
   gated();
   for(const role of ['a','b','c'])expect(isIsolatedQaCookieOrigin(origin(role))).toBe(true);
   for(const url of [origin('d'),origin('a').replace('41357','41358'),
     'http://127.0.0.1:5173','http://localhost:3000','https://gafus.ru',
     `http://qa-a-${run}.localhost.evil.test:${port}`])
     expect(isIsolatedQaCookieOrigin(url)).toBe(false);
 });
 it('rejects production and normal dev or a DB/Redis not explicitly disposable',()=>{
   gated();
   for(const [key,value] of [
     ['NODE_ENV','production'],['NODE_ENV','development'],
     ['GAFUS_LOCAL_ISOLATED_API','0'],['GAFUS_QA_COOKIE_BROWSER_ACCEPTANCE','0'],
     ['DATABASE_URL','postgresql://qahttp@127.0.0.1:42354/some_work?schema=public'],
     ['DATABASE_URL','postgresql://qahttp@185.239.51.125:5432/archqa_cookie_ab12cd34ef56'],
     ['REDIS_URL','redis://127.0.0.1:6379/1'],
     ['GAFUS_QA_COOKIE_PORT','3001'],
     ['FEED_ENABLED','true'],
   ]){
     vi.stubEnv(key,value);
     expect(isIsolatedQaCookieOrigin(origin('a'))).toBe(false);
     gated();
   }
 });
 it('browser cookies on exact origin are HttpOnly, Lax and path-scoped; HTTP only for gated QA',async()=>{
   gated();
   const app=new Hono();
   app.post('/api/v1/qa',c=>{
     const trusted=isTrustedBrowserOrigin(c);
     setBrowserSession(c,'synthetic-access','synthetic-refresh');
     return c.json({trusted});
   });
   const good=await app.request(origin('a')+'/api/v1/qa',{method:'POST',headers:{Origin:origin('a')}});
   expect((await good.json()).trusted).toBe(true);
   const headers=good.headers.getSetCookie();
   expect(headers).toHaveLength(2);
   expect(headers.every(x=>/HttpOnly/i.test(x)&&/SameSite=Lax/i.test(x)&&/Path=\/api\/v1/i.test(x)&&!/; Secure/i.test(x))).toBe(true);
   vi.stubEnv('NODE_ENV','production');
   const locked=await app.request(origin('a')+'/api/v1/qa',{method:'POST',headers:{Origin:origin('a')}});
   expect((await locked.json()).trusted).toBe(false);
   expect(locked.headers.getSetCookie().every(x=>/; Secure/i.test(x))).toBe(true);
 });
});
