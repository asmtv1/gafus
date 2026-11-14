/** Explicit local-only full synthetic E2E:
 * Hono ingress -> real 127.0.0.1:65493 PG -> Worker exporter -> Uptrace Nonprod.
 * No web listener, no user/session/password data, never touches Prod DSN.
 */
import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {prisma} from '@gafus/prisma';
import {createWebTelemetryRoutes} from '../../apps/api/src/routes/v1/web-telemetry.ts';
import {findDueTelemetrySpoolRows,claimTelemetrySpoolRow,
 finishTelemetrySpoolRow} from '@gafus/mobile-ota-server/diagnostics-spool-repository';
import {exportMobileTelemetryEvent} from '../../packages/worker/src/mobile-telemetry-export.ts';
import {renderMobileTelemetryMetricsPrometheus} from '../../packages/worker/src/mobile-telemetry-spool-worker.ts';
import {readCanaryDsn} from './uptrace-nonprod-canary.mjs';

const exact=/^postgresql:\/\/[^@\s]+@127\.0\.0\.1:65493\/gafus_refactor_telemetry_sdk57_qa\?schema=public$/;
if(!exact.test(process.env.DATABASE_URL??'')||
 process.env.GAFUS_TELEMETRY_TEST_ISOLATED!=='true'||
 process.env.GAFUS_API_REALPG_ISOLATED!=='1')throw Error('LOCAL_E2E_REQUIRES_ISOLATED_PG');

const dsn=await readCanaryDsn();
const now=new Date();
const eventId=randomUUID(), appStartId=randomUUID();
const build='1'.repeat(40);
const env={
 GAFUS_TELEMETRY_WEB_INGEST_ENABLED:'true',
 GAFUS_TELEMETRY_ENVIRONMENT:'preview',
 GAFUS_WEB_TELEMETRY_RELEASES:JSON.stringify({'gafus-web':[{appVersion:'1.7.3',build}]}),
};
const app=new Hono().route('/api/v1/telemetry/web',createWebTelemetryRoutes({env}));
const headers={'Origin':'https://gafus.ru','Host':'gafus.ru',
 'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const session=await app.request('https://gafus.ru/api/v1/telemetry/web/session',
 {method:'POST',headers,body:JSON.stringify({appVersion:'1.7.3',build})});
if(session.status!==201)throw Error('LOCAL_E2E_SESSION_UNAVAILABLE');
const response=await session.json() as {token?:string};
if(!response.token)throw Error('LOCAL_E2E_SESSION_EMPTY');
const body=JSON.stringify({schemaVersion:1,events:[{
 schemaVersion:1,eventId,appStartId,platform:'web',kind:'react_error',
 severity:'ERROR',occurredAt:now.toISOString(),
 appVersion:'1.7.3',build,runtime:build,channel:'web',updateId:'embedded',
 errorCode:'WEB_REACT_RENDER',
 stack:'at CanaryReactError (bundle:83:21)',
}]});
const opts={method:'POST',headers:{...headers,Authorization:'Bearer '+response.token},body};
const ingest=await app.request('https://gafus.ru/api/v1/telemetry/web',opts);
if(ingest.status!==200)throw Error('LOCAL_E2E_INGEST_NO_ACK');
const first=await ingest.json() as {accepted?:string[];newlyInserted?:number};
if(first.newlyInserted!==1||!first.accepted?.includes(eventId))
 throw Error('LOCAL_E2E_ACK_SCHEMA');
const dup=await app.request('https://gafus.ru/api/v1/telemetry/web',opts);
if(dup.status!==200||(await dup.json()).newlyInserted!==0)
 throw Error('LOCAL_E2E_REPLAY_DUPLICATE');
const serviceMetrics=await renderMobileTelemetryMetricsPrometheus('preview');
if(!serviceMetrics.includes('service="gafus-web",status="PENDING"} 1')||
   !serviceMetrics.includes('service="gafus-mobile-ios",status="PENDING"} 0')||
   !serviceMetrics.includes('service="gafus-mobile-android",status="PENDING"} 0'))
 throw Error('LOCAL_E2E_SERVICE_METRICS_INVALID');
const due=(await findDueTelemetrySpoolRows('preview',new Date(now.getTime()+1000)))
 .find(x=>x.eventId===eventId);
if(!due)throw Error('LOCAL_E2E_SPOOL_MISSING');
const runId='nonprod-e2e-'+randomUUID();
if(!await claimTelemetrySpoolRow(due.id,new Date(now.getTime()+1000),'preview',runId))
 throw Error('LOCAL_E2E_LEASE_MISSING');
const result=await exportMobileTelemetryEvent({
 eventId:due.eventId,service:due.service,environment:due.environment,
 attempts:due.attempts,payload:due.payload,
},{endpoint:'https://api.uptrace.dev/v1/logs',dsn});
if(result.kind!=='exported')throw Error('LOCAL_E2E_VENDOR_NO_ACK');
if(!await finishTelemetrySpoolRow(due.id,'EXPORTED',new Date(now.getTime()+2000),runId))
 throw Error('LOCAL_E2E_FINISH_FAILED');
const saved=await prisma.mobileTelemetrySpool.findUniqueOrThrow({where:{id:due.id}});
if(saved.status!=='EXPORTED'||JSON.stringify(saved.payload)!=='{}')
 throw Error('LOCAL_E2E_PAYLOAD_NOT_REDACTED');
console.log(JSON.stringify({project:9383,service:'gafus-web',
  flow:'Hono -> PostgreSQL -> Worker -> Uptrace Nonprod',
  grant:201,durableAck:200,replayNewlyInserted:0,
  cloudExport:'200',databaseState:'EXPORTED',payloadCleared:true}));
await prisma.$disconnect();
