import {describe,it,expect,vi} from 'vitest';
import {createWebTelemetryRoutes,configuredWebReleases} from './web-telemetry.js';
import type {WebTelemetryRepository} from '@gafus/mobile-ota-server/diagnostics-web-repository';
const BUILD='9'.repeat(40),VERSION='1.7.3';
const env:NodeJS.ProcessEnv={
 GAFUS_TELEMETRY_WEB_INGEST_ENABLED:'true',
 GAFUS_TELEMETRY_ENVIRONMENT:'preview',
 GAFUS_WEB_TELEMETRY_RELEASES:JSON.stringify({
   'gafus-web':[{appVersion:VERSION,build:BUILD}],
   'gafus-admin-panel':[{appVersion:VERSION,build:BUILD}],
 }),
};
const headers={'Content-Type':'application/json','Origin':'https://gafus.ru',
 'Host':'gafus.ru','Sec-Fetch-Site':'same-origin'};
function fixtureRepo() {
  const grants=new Map<string,any>();
  const events=new Map<string,unknown>();
  const repo:WebTelemetryRepository={
    async issueGrant(input){grants.set(input.tokenHash,input);},
    async persistBatch(input){
      if(!grants.get(input.tokenHash))throw new Error('MISSING_GRANT');
      const fresh=input.events.filter(e=>!events.has(e.eventId));
      for(const e of fresh)events.set(e.eventId,e);
      return {accepted:input.events.map(e=>e.eventId),newlyInserted:fresh.length};
    },
  };
  return {repo,grants,events};
}
const event=()=>({
  schemaVersion:1,eventId:'b6b9dc0d-7e53-4da4-8f20-910fd3520be6',
  appStartId:'b6b9dc0d-7e53-4da4-8f20-910fd3520be7',
  platform:'web',kind:'react_error',severity:'ERROR',
  occurredAt:new Date().toISOString(),appVersion:VERSION,build:BUILD,
  runtime:BUILD,channel:'web',updateId:'embedded',errorCode:'WEB_RENDER_ERROR',
  stack:'Error: Authorization: Bearer secret\n at Button.click (https://private.example/secret?token=xyz:44:9)',
});
describe('Web same-origin telemetry grant and ACK',()=>{
 it('requires enabled allowlisted server release registry',()=>{
   expect(configuredWebReleases(env).get('gafus-web')).toHaveLength(1);
   expect(()=>configuredWebReleases({...env,GAFUS_WEB_TELEMETRY_RELEASES:'{}'})).not.toThrow();
   expect(()=>configuredWebReleases({...env,GAFUS_WEB_TELEMETRY_RELEASES:'{"gafus-pwned":[]}'}))
     .toThrow('WEB_RELEASE_CONFIGURATION_INVALID');
 });
 it('rejects disabled, cross-origin and unverified builds',async()=>{
   const {repo}=fixtureRepo();
   const disabled=createWebTelemetryRoutes({env:{...env,GAFUS_TELEMETRY_WEB_INGEST_ENABLED:'false'},repository:repo});
   const body=JSON.stringify({appVersion:VERSION,build:BUILD});
   expect((await disabled.request('https://gafus.ru/session',{method:'POST',headers,body})).status).toBe(503);
   const app=createWebTelemetryRoutes({env,repository:repo});
   expect((await app.request('https://gafus.ru/session',{method:'POST',
     headers:{...headers,Origin:'https://evil.invalid'},body})).status).toBe(403);
   expect((await app.request('https://gafus.ru/session',{method:'POST',
     headers:{...headers,Host:'api.gafus.ru'},body})).status).toBe(403);
   expect((await app.request('https://gafus.ru/session',{method:'POST',
     headers:{...headers,'Sec-Fetch-Site':'cross-site'},body})).status).toBe(403);
   expect((await app.request('https://gafus.ru/session',{method:'POST',headers,
     body:JSON.stringify({appVersion:VERSION,build:'0'.repeat(40)})})).status).toBe(403);
 });
 it('grants short token then ACKs only accepted events, no cookies',async()=>{
   const {repo,grants,events}=fixtureRepo();
   const app=createWebTelemetryRoutes({env,repository:repo});
   const response=await app.request('https://gafus.ru/session',{method:'POST',
     headers,body:JSON.stringify({appVersion:VERSION,build:BUILD})});
   expect(response.status).toBe(201);
   expect(response.headers.get('set-cookie')).toBeNull();
   expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
   expect(response.headers.get('cache-control')).toBe('no-store');
   const grant=await response.json() as {token:string;maxEvents:number};
   expect(grant.token).toMatch(/^[\w-]{43}$/);
   expect(grant.maxEvents).toBe(50);
   expect(grants.size).toBe(1);
   const batch=JSON.stringify({schemaVersion:1,events:[event()]});
   const upload=()=>app.request('https://gafus.ru/',{method:'POST',
     headers:{...headers,Authorization:'Bearer '+grant.token},body:batch});
   const first=await upload();
   expect(first.status).toBe(200);
   expect(await first.json()).toEqual({accepted:[event().eventId],newlyInserted:1});
   expect((await (await upload()).json()).newlyInserted).toBe(0);
   expect(events.size).toBe(1);
   const stored=events.get(event().eventId) as {stack?:string};
   expect(stored.stack).not.toMatch(/secret|private\.example|Authorization|token/);
 });
 it('rejects unexpected batch fields and cannot accept without grant',async()=>{
   const {repo}=fixtureRepo();
   const app=createWebTelemetryRoutes({env,repository:repo});
   const noGrant=await app.request('https://gafus.ru/',{method:'POST',headers,
     body:JSON.stringify({schemaVersion:1,events:[event()]})});
   expect(noGrant.status).toBe(401);
   const malformed=await app.request('https://gafus.ru/session',{method:'POST',headers,
     body:JSON.stringify({appVersion:VERSION,build:BUILD,token:'raw-secret'})});
   expect(malformed.status).toBe(400);
 });
});
