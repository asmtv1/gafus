/** Public same-origin browser diagnostic ingest. No auth cookie, no client DSN.
 * Origin is an abuse guard, not proof of identity; budget is enforced in PG.
 * Disabled without an immutable server-side release allowlist. */
import {createHash,randomBytes} from 'node:crypto';
import {Hono} from 'hono';
import {parseMobileTelemetryBatch,type MobileTelemetryBatchV1} from '@gafus/types';
import {decodeBoundedJson} from './mobile-telemetry.js';
import {TelemetryIngressRateGate} from '../../modules/mobile-telemetry/ingest.js';
import {
  prismaWebTelemetryRepository,WebTelemetryStoreError,
  type WebTelemetryRepository,type WebTelemetryService,
  type WebTelemetryEnvironment,type WebRelease,
} from '@gafus/mobile-ota-server/diagnostics-web-repository';

const ORIGIN_SERVICE:Record<string,WebTelemetryService>={
  'https://gafus.ru':'gafus-web',
  'https://www.gafus.ru':'gafus-web',
  'https://adminka.gafus.ru':'gafus-admin-panel',
  'https://trainer-panel.gafus.ru':'gafus-trainer-panel',
  'https://queues.gafus.ru':'gafus-bull-board',
};
const VERSION=/^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:[-+][a-zA-Z0-9.-]{1,24})?$/;
const BUILD=/^[a-zA-Z0-9_.-]{8,40}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const services=new Set(Object.values(ORIGIN_SERVICE));
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export class WebTelemetryIngressError extends Error {
  constructor(readonly code:string,readonly status:number){super(code);}
}
export function configuredWebReleases(env:NodeJS.ProcessEnv) {
  const raw=env.GAFUS_WEB_TELEMETRY_RELEASES;
  if(!raw||raw.length>8192)throw new WebTelemetryIngressError('WEB_RELEASE_CONFIGURATION_MISSING',503);
  let data:unknown;
  try{data=JSON.parse(raw);}catch{throw new WebTelemetryIngressError('WEB_RELEASE_CONFIGURATION_INVALID',503);}
  if(!data||Array.isArray(data)||typeof data!=='object')throw new WebTelemetryIngressError('WEB_RELEASE_CONFIGURATION_INVALID',503);
  const result=new Map<WebTelemetryService,WebRelease[]>();
  for(const [service,items] of Object.entries(data)){
    if(!services.has(service as WebTelemetryService)||!Array.isArray(items)||items.length>4)
      throw new WebTelemetryIngressError('WEB_RELEASE_CONFIGURATION_INVALID',503);
    const accepted:WebRelease[]=[];
    for(const record of items) {
      if(!record||typeof record!=='object'||Array.isArray(record)||
        Object.keys(record).some(k=>!['appVersion','build'].includes(k)))
        throw new WebTelemetryIngressError('WEB_RELEASE_CONFIGURATION_INVALID',503);
      const r=record as Record<string,unknown>;
      if(typeof r.appVersion!=='string'||!VERSION.test(r.appVersion)||
        typeof r.build!=='string'||!BUILD.test(r.build))
        throw new WebTelemetryIngressError('WEB_RELEASE_CONFIGURATION_INVALID',503);
      accepted.push({appVersion:r.appVersion,build:r.build});
    }
    result.set(service as WebTelemetryService,accepted);
  }
  return result;
}
function webEnvironment(env:NodeJS.ProcessEnv):WebTelemetryEnvironment|null {
  if(env.GAFUS_TELEMETRY_WEB_INGEST_ENABLED!=='true')return null;
  const e=env.GAFUS_TELEMETRY_ENVIRONMENT;
  if(e!=='preview'&&e!=='production')return null;
  if(e==='production'&&env.GAFUS_TELEMETRY_PRODUCTION_APPROVED!=='true')return null;
  return e;
}
function serviceFromRequest(origin:unknown,host:unknown,site:unknown):WebTelemetryService {
  if(typeof origin!=='string'||typeof host!=='string'||!Object.hasOwn(ORIGIN_SERVICE,origin))
    throw new WebTelemetryIngressError('WEB_ORIGIN_REJECTED',403);
  const url=new URL(origin);
  if(host!==url.host || (site!==undefined&&site!=='same-origin'))
    throw new WebTelemetryIngressError('WEB_ORIGIN_REJECTED',403);
  return ORIGIN_SERVICE[origin]!;
}
const defaultGate=new TelemetryIngressRateGate(120,10);
export function createWebTelemetryRoutes({
  env=process.env,repository=prismaWebTelemetryRepository,gate=defaultGate,now=()=>new Date(),
}:{
  env?:NodeJS.ProcessEnv;repository?:WebTelemetryRepository;gate?:TelemetryIngressRateGate;
  now?:()=>Date;
}={}) {
  const app=new Hono();
  app.use('*',async(c,next)=>{
    c.header('Cache-Control','no-store');
    c.header('Referrer-Policy','no-referrer');
    c.header('X-Content-Type-Options','nosniff');
    await next();
  });
  function check(c:any) {
    const environment=webEnvironment(env);
    if(!environment)throw new WebTelemetryIngressError('WEB_TELEMETRY_DISABLED',503);
    const service=serviceFromRequest(c.req.header('Origin'),c.req.header('Host'),
      c.req.header('Sec-Fetch-Site'));
    if(!gate.consume(null,now().getTime()))
      throw new WebTelemetryIngressError('WEB_GLOBAL_RATE_LIMIT',429);
    return {environment,service};
  }
  const errorResponse=(code:string,status:number) =>
    new Response(JSON.stringify({error:code}),{status,headers:{'Content-Type':'application/json',
      'Cache-Control':'no-store'}});
  async function handle(c:any,kind:'session'|'events') {
    try{
      const {environment,service}=check(c);
      if(kind==='session'){
        const data=await decodeBoundedJson(c.req.raw,2048);
        if(!data||typeof data!=='object'||Array.isArray(data)||
          Object.keys(data).some(k=>!['appVersion','build'].includes(k)))
          throw new WebTelemetryIngressError('WEB_SESSION_INVALID',400);
        const input=data as Record<string,unknown>;
        const release=configuredWebReleases(env).get(service)?.find(r=>
          r.appVersion===input.appVersion&&r.build===input.build);
        if(!release)throw new WebTelemetryIngressError('WEB_RELEASE_NOT_VERIFIED',403);
        const token=randomBytes(32).toString('base64url');
        const expiresAt=new Date(now().getTime()+15*60_000);
        await repository.issueGrant({tokenHash:sha(token),service,release,environment,expiresAt});
        return c.json({token,expiresAt:expiresAt.toISOString(),maxEvents:50},201);
      }
      const authorization=c.req.header('Authorization');
      if(!authorization?.startsWith('Bearer ')||!TOKEN.test(authorization.slice(7)))
        throw new WebTelemetryIngressError('WEB_GRANT_REQUIRED',401);
      let batch:MobileTelemetryBatchV1;
      try{batch=parseMobileTelemetryBatch(await decodeBoundedJson(c.req.raw,128*1024));}
      catch{throw new WebTelemetryIngressError('WEB_BATCH_INVALID',400);}
      const accepted=await repository.persistBatch({
        tokenHash:sha(authorization.slice(7)),service,environment,now:now(),events:batch.events,
      });
      // Acknowledgement only AFTER DB transaction commit, with stable IDs.
      return c.json(accepted,200);
    }catch(error) {
      if(error instanceof WebTelemetryIngressError||error instanceof WebTelemetryStoreError)
        return errorResponse(error.code,error.status);
      const known=error as {status?:number;code?:string};
      if(known?.status===413)return errorResponse('WEB_PAYLOAD_TOO_LARGE',413);
      return errorResponse('WEB_INGEST_UNAVAILABLE',503);
    }
  }
  app.post('/session',c=>handle(c,'session'));
  app.post('/',c=>handle(c,'events'));
  return app;
}
export const webTelemetryRoutes=createWebTelemetryRoutes();
