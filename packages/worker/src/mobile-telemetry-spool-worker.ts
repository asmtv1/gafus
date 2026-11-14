/** Dedicated, bounded PostgreSQL spool consumer; harmless when disabled.
 * Leases are claimed with CAS and can be recovered after a worker crash. */
import {randomUUID} from 'node:crypto';
import {
  claimTelemetrySpoolRow, finishTelemetrySpoolRow, findDueTelemetrySpoolRows,
  purgeExpiredTelemetrySpool, snapshotTelemetrySpool, snapshotTelemetrySpoolByService,
} from '@gafus/mobile-ota-server/diagnostics-spool-repository';
import {createWorkerLogger} from '@gafus/logger';
import {buildMobileOtlpLog, exportMobileTelemetryEvent, mobileOtlpLogsUrl} from './mobile-telemetry-export';

const logger=createWorkerLogger('mobile-telemetry');
const RUN_ID=randomUUID();
const PERIOD_MS=15_000;
const ALLOWED_SERVICES=new Set([
  'gafus-mobile-ios','gafus-mobile-android','gafus-web','gafus-admin-panel',
  'gafus-trainer-panel','gafus-bull-board',
]);
const ALLOWED_ENVS=new Set(['preview','production']);
export const mobileTelemetryExportCounters={exported:0,retried:0,dead:0,expired:0,skipped:0,authBlocked:0};
type ServiceOutcome = 'exported'|'retried'|'dead'|'authBlocked';
const perServiceOutcomes=new Map<string,Record<ServiceOutcome,number>>();
function bumpServiceOutcome(environment:'preview'|'production',service:string,outcome:ServiceOutcome) {
  // Database rows never become dynamic Prometheus labels.
  if(!ALLOWED_SERVICES.has(service)||!ALLOWED_ENVS.has(environment))return;
  const key=environment+'|'+service;
  const counts=perServiceOutcomes.get(key)??{exported:0,retried:0,dead:0,authBlocked:0};
  counts[outcome]++;
  perServiceOutcomes.set(key,counts);
}
let started=false;
let draining=false;
// Reset only after an operator rotates the secret and restarts the Worker.
let authSuspended=false;
let ticks=0;

async function claimOne(rowId:string,now:Date,environment:'preview'|'production') {
  return claimTelemetrySpoolRow(rowId,now,environment,RUN_ID);
}
async function finishOne(rowId:string,status:'PENDING'|'EXPORTED'|'DEAD',
  now:Date,retryMs=0,code?:string) {
  return finishTelemetrySpoolRow(rowId,status,now,RUN_ID,retryMs,code);
}
async function purgeExpired(now:Date) {
  const results=await purgeExpiredTelemetrySpool(now);
  mobileTelemetryExportCounters.expired+=results.events;
  return results;
}

export async function drainMobileTelemetrySpool(options:{endpoint:string;dsn:string;environment:'preview'|'production'},
  clock:()=>Date=()=>new Date()) {
  if(draining)return;
  draining=true;
  try {
    if(authSuspended)return; // Cleanup still occurs in finally.
    const candidates=await findDueTelemetrySpoolRows(options.environment,clock(),20);
    for (const row of candidates) {
      if (!(await claimOne(row.id,clock(),options.environment))) continue;
      if(!ALLOWED_SERVICES.has(row.service)||!ALLOWED_ENVS.has(row.environment)||row.environment!==options.environment) {
        await finishOne(row.id,'DEAD',clock(),0,'UNSAFE_SERVICE_SCOPE');
        mobileTelemetryExportCounters.dead++;
        continue;
      }
      const result=await exportMobileTelemetryEvent({eventId:row.eventId,
        service:row.service,environment:row.environment,payload:row.payload,attempts:row.attempts},options);
      if(result.kind==='suspended') {
        await finishOne(row.id,'PENDING',clock(),900_000,result.code);
        authSuspended=true;
        mobileTelemetryExportCounters.authBlocked++;bumpServiceOutcome(options.environment,row.service,'authBlocked');
        break;
      } else if(result.kind==='exported') {
        await finishOne(row.id,'EXPORTED',clock());mobileTelemetryExportCounters.exported++;bumpServiceOutcome(options.environment,row.service,'exported');
      } else if(result.kind==='retry') {
        await finishOne(row.id,'PENDING',clock(),result.delayMs,result.code);
        mobileTelemetryExportCounters.retried++;bumpServiceOutcome(options.environment,row.service,'retried');
      } else {
        await finishOne(row.id,'DEAD',clock(),0,result.code);
        mobileTelemetryExportCounters.dead++;bumpServiceOutcome(options.environment,row.service,'dead');
      }
    }
  } catch {
    // Do not log untrusted error objects or provider responses.
    mobileTelemetryExportCounters.skipped++;
  } finally {
    // Retention cleanup must not depend on successful exporter ticks.
    if (++ticks % 120 === 0) {
      try { await purgeExpired(clock()); }
      catch { mobileTelemetryExportCounters.skipped++; }
    }
    draining=false;
  }
}
export function startMobileTelemetryExportWorker(env:NodeJS.ProcessEnv=process.env):boolean {
  if(started)return true;
  if(env.GAFUS_TELEMETRY_EXPORT_ENABLED!=='true')return false;
  if(!ALLOWED_ENVS.has(env.GAFUS_TELEMETRY_ENVIRONMENT??''))return false;
  if(env.GAFUS_TELEMETRY_ENVIRONMENT==='production' &&
      env.GAFUS_TELEMETRY_PRODUCTION_APPROVED!=='true')return false;
  const endpoint=mobileOtlpLogsUrl(env);
  const dsn=env.UPTRACE_DSN;
  if(!endpoint||!dsn||dsn.length>4096||dsn.length<12)return false;
  started=true;
  const environment=env.GAFUS_TELEMETRY_ENVIRONMENT as 'preview'|'production';
  const timer=setInterval(()=>void drainMobileTelemetrySpool({endpoint,dsn,environment}),PERIOD_MS);
  timer.unref?.();
  void drainMobileTelemetrySpool({endpoint,dsn,environment});
  logger.info('SDK57 durable telemetry worker enabled', {environment:env.GAFUS_TELEMETRY_ENVIRONMENT??'unknown'});
  return true;
}

/** Fixed-cardinality Prometheus metrics; only worker-internal endpoint exposes them. */
export async function renderMobileTelemetryMetricsPrometheus(
  environment: string = process.env.GAFUS_TELEMETRY_ENVIRONMENT ?? '',
): Promise<string> {
  if (!ALLOWED_ENVS.has(environment)) return '# gafus_mobile_telemetry_metrics_disabled 1\n';
  const day = new Date(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
  const scope=environment as 'preview'|'production';
  const [snapshot,serviceBacklog]=await Promise.all([
    snapshotTelemetrySpool(scope,day),snapshotTelemetrySpoolByService(scope),
  ]);
  const {pending,leased,dead,acceptedEvents,acceptedBytes}=snapshot;
  const lines = [
    '# HELP gafus_mobile_telemetry_queued_entries Pending durable diagnostics',
    '# TYPE gafus_mobile_telemetry_queued_entries gauge',
    `gafus_mobile_telemetry_queued_entries{environment="${environment}"} ${pending}`,
    '# HELP gafus_mobile_telemetry_leased_entries Leased diagnostics in export',
    '# TYPE gafus_mobile_telemetry_leased_entries gauge',
    `gafus_mobile_telemetry_leased_entries{environment="${environment}"} ${leased}`,
    '# HELP gafus_mobile_telemetry_dead_entries Permanently rejected diagnostics',
    '# TYPE gafus_mobile_telemetry_dead_entries gauge',
    `gafus_mobile_telemetry_dead_entries{environment="${environment}"} ${dead}`,
    '# HELP gafus_mobile_telemetry_daily_events Accepted diagnostics for UTC day',
    '# TYPE gafus_mobile_telemetry_daily_events gauge',
    `gafus_mobile_telemetry_daily_events{environment="${environment}"} ${acceptedEvents}`,
    '# HELP gafus_mobile_telemetry_daily_bytes Accepted JSON bytes for UTC day',
    '# TYPE gafus_mobile_telemetry_daily_bytes gauge',
    `gafus_mobile_telemetry_daily_bytes{environment="${environment}"} ${acceptedBytes}`,
    '# HELP gafus_mobile_telemetry_auth_suspended Ingest authentication needs an operator rekey/restart',
    '# TYPE gafus_mobile_telemetry_auth_suspended gauge',
    `gafus_mobile_telemetry_auth_suspended{environment="${environment}"} ${authSuspended?1:0}`,
    '# HELP gafus_mobile_telemetry_export_total Exporter outcomes this process',
    '# TYPE gafus_mobile_telemetry_export_total counter',
    ...Object.entries(mobileTelemetryExportCounters).map(([outcome,total]) =>
      `gafus_mobile_telemetry_export_total{outcome="${outcome}"} ${total}`),
    '# HELP gafus_mobile_telemetry_service_spool_entries Pending leased or dead diagnostic events by fixed service',
    '# TYPE gafus_mobile_telemetry_service_spool_entries gauge',
    ...serviceBacklog.map(({service,status,count})=>
      `gafus_mobile_telemetry_service_spool_entries{environment="${environment}",service="${service}",status="${status}"} ${count}`),
    '# HELP gafus_mobile_telemetry_service_export_total Fixed-service exporter outcomes',
    '# TYPE gafus_mobile_telemetry_service_export_total counter',
    ...[...ALLOWED_SERVICES].flatMap(service=>
      (['exported','retried','dead','authBlocked'] as const).map(outcome=>
        `gafus_mobile_telemetry_service_export_total{environment="${environment}",service="${service}",outcome="${outcome}"} ${perServiceOutcomes.get(environment+'|'+service)?.[outcome]??0}`)),
  ];
  return lines.join('\n')+'\n';
}
