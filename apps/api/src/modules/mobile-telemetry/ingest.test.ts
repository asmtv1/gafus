import { describe, expect, it } from 'vitest';
import {
  createMobileTelemetryIngest, TelemetryIngressRateGate, MobileTelemetryIngestError,
  type MobileTelemetryRepository, type TelemetryIdentity, type UploadGrant,
} from './ingest.js';
import { createMobileTelemetryRoutes } from '../../routes/v1/mobile-telemetry.js';
import type { MobileTelemetryEventV1 } from '@gafus/types';

const now = new Date('2026-11-13T12:00:00.000Z');
const fakeEnv: NodeJS.ProcessEnv = {GAFUS_TELEMETRY_INGEST_ENABLED:'true',GAFUS_TELEMETRY_ENVIRONMENT:'preview'};
const release = () => ({platform:'ios',appVersion:'1.8.0',build:'17',runtime:'1.8.0',channel:'preview',nativeFingerprint:'a'.repeat(64)});
const event = () => ({schemaVersion:1,eventId:'a0e85460-2534-4e2b-a70a-ceaa3e4a1501',platform:'ios',
  kind:'js_handled',severity:'ERROR',occurredAt:new Date().toISOString(),appVersion:'1.8.0',build:'17',
  runtime:'1.8.0',channel:'preview',updateId:'embedded',appStartId:'b6b9dc0d-7e53-4da4-8f20-910fd3520be7',
  stack:'Error: token Secret! user@example.com\n at MyFn (https://private.dev/path?auth=123:2:14)',
});
function repository():MobileTelemetryRepository & {grants:UploadGrant[];receipts:MobileTelemetryEventV1[]} {
  const grants:UploadGrant[]=[];const receipts:MobileTelemetryEventV1[]=[];
  return {grants,receipts,
    async isVerifiedRelease(_:TelemetryIdentity){return true;},
    async createGrant(input){grants.push(input);},
    async persistBatch(input){receipts.push(...input.events);return {accepted:input.events.map(e=>e.eventId),newlyInserted:input.events.length};},
  };
}
describe('SDK57 anonymous release-gated telemetry ingest', () => {
 it('does not create grants while server is disabled or unapproved production',async()=>{
   const repo=repository();
   await expect(createMobileTelemetryIngest(repo,{},()=>now).issueUploadGrant(release()))
      .rejects.toMatchObject({code:'TELEMETRY_DISABLED',status:503});
   await expect(createMobileTelemetryIngest(repo,{GAFUS_TELEMETRY_INGEST_ENABLED:'true',
     GAFUS_TELEMETRY_ENVIRONMENT:'production'},()=>now).issueUploadGrant(release()))
      .rejects.toMatchObject({code:'TELEMETRY_DISABLED'});
   expect(repo.grants).toHaveLength(0);
 });
 it('issues an ephemeral 256-bit upload grant and stores only its digest',async()=>{
   const repo=repository(), ingest=createMobileTelemetryIngest(repo,fakeEnv,()=>now);
   const grant=await ingest.issueUploadGrant(release());
   expect(grant.token).toMatch(/^[\w-]{43}$/);expect(repo.grants).toHaveLength(1);
   expect(repo.grants[0]?.tokenHash).toMatch(/^[a-f\d]{64}$/);
   expect(JSON.stringify(repo.grants)).not.toContain(grant.token);
   expect(grant.expiresAt).toBe('2026-11-13T12:15:00.000Z');
 });
 it('scrubs sensitive inputs before the repository can persist anything',async()=>{
   const repo=repository(),ingest=createMobileTelemetryIngest(repo,fakeEnv,()=>now);
   const grant=await ingest.issueUploadGrant(release());
   const accepted=await ingest.acceptBatch('Bearer '+grant.token,{schemaVersion:1,events:[event()]});
   expect(accepted.accepted).toHaveLength(1);
   expect(JSON.stringify(repo.receipts)).not.toMatch(/private\.dev|user@example.com|Secret|auth=123/);
   expect(repo.receipts[0]?.stack).toContain('bundle:2:14');
 });
 it('rejects unauthorized token and unknown identity fields',async()=>{
   const repo=repository(),ingest=createMobileTelemetryIngest(repo,fakeEnv,()=>now);
   await expect(ingest.issueUploadGrant({...release(),deviceId:'untrusted'})).rejects.toMatchObject({code:'SESSION_UNKNOWN_FIELD'});
   await expect(ingest.acceptBatch('Bearer invalid',{schemaVersion:1,events:[event()]}))
     .rejects.toMatchObject({code:'TELEMETRY_UPLOAD_GRANT_REQUIRED',status:401});
   await expect(ingest.acceptBatch(undefined,{schemaVersion:1,events:[event()]}))
     .rejects.toBeInstanceOf(MobileTelemetryIngestError);
 });
 it('limits ingress independently of Redis',()=>{
   const gate=new TelemetryIngressRateGate(3,2);
   expect(gate.consume('a',1000)).toBe(true);
   expect(gate.consume('a',1000)).toBe(true);
   expect(gate.consume('a',1000)).toBe(false);
   expect(gate.consume('b',1000)).toBe(true);
   expect(gate.consume('c',1000)).toBe(false);
   expect(gate.consume('a',62000)).toBe(true);
 });
 it('does not accidentally rate-limit all anonymous clients as a single peer',()=>{
   const gate=new TelemetryIngressRateGate(4,2);
   for(let i=0;i<4;i++)expect(gate.consume(null,1000)).toBe(true);
   expect(gate.consume(null,1000)).toBe(false);
   expect(gate.consume(null,61000)).toBe(true);
 });
 it('responds 202 only after repository ACK, with no body echo or browser caching',async()=>{
   const repo=repository(),ingest=createMobileTelemetryIngest(repo,fakeEnv,()=>new Date());
   const app=createMobileTelemetryRoutes({ingest,env:fakeEnv,rateGate:new TelemetryIngressRateGate(10,10)});
   const session=await app.request('/mobile/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(release())});
   expect(session.status).toBe(201);expect(session.headers.get('Cache-Control')).toContain('no-store');
   const issued=await session.json() as {token:string};
   const batch=await app.request('/mobile',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+issued.token},
     body:JSON.stringify({schemaVersion:1,events:[event()]})});
   expect(batch.status).toBe(202);expect(await batch.text()).not.toContain('user@example.com');
 });
 it('rejects oversized and content-encoded bodies before parsing',async()=>{
   const repo=repository(),ingest=createMobileTelemetryIngest(repo,fakeEnv,()=>now);
   const app=createMobileTelemetryRoutes({ingest,env:fakeEnv,rateGate:new TelemetryIngressRateGate(10,10)});
   const bad=await app.request('/mobile/session',{method:'POST',headers:{'content-type':'text/plain'},body:'secret'});
   expect(bad.status).toBe(415);
   const large=await app.request('/mobile/session',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(2049)});
   expect(large.status).toBe(413);
 });
});
