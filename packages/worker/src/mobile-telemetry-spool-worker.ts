/** Dedicated, bounded PostgreSQL spool consumer; harmless when disabled.
 * Leases are claimed with CAS and can be recovered after a worker crash. */
import {randomUUID} from 'node:crypto';
import {
  claimTelemetrySpoolRow, finishTelemetrySpoolRow, findDueTelemetrySpoolRows,
  purgeExpiredTelemetrySpool, snapshotTelemetrySpool, snapshotTelemetrySpoolByService, resolveTelemetryRelease, snapshotMobileSessionHealth,
} from '@gafus/mobile-ota-server/diagnostics-spool-repository';
import {createMobilePrivateSymbolReader} from '@gafus/cdn-upload/mobile-private-symbols';
import {createMobileSymbolicator, type MobileSymbolication} from './mobile-telemetry-symbolication';
import {addMobilePerformance,renderMobilePerformance} from './mobile-telemetry-performance';
import {createMobileFailureMetrics} from './mobile-telemetry-failure-metrics';
import {parseMobileTelemetryEvent} from '@gafus/types';
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
let timer: ReturnType<typeof setInterval> | undefined;
let draining=false;
// Reset only after an operator rotates the secret and restarts the Worker.
let authSuspended=false;
let ticks=0;
const qualityCounters = new Map<string,number>();
const failureMetrics=createMobileFailureMetrics();
const deliveryCounters=new Map<string,{count:number;seconds:number}>();
const clientHealthCounters=new Map<string,number>();
function recordDiagnosticQuality(platform:string, outcome:string) {
  if(platform!=='ios'&&platform!=='android')return;
  const key=platform+'|'+outcome;
  qualityCounters.set(key,(qualityCounters.get(key)??0)+1);
}
const symbolize=createMobileSymbolicator(createMobilePrivateSymbolReader());

async function claimOne(rowId:string,now:Date,environment:'preview'|'production') {
  return claimTelemetrySpoolRow(rowId,now,environment,RUN_ID);
}
async function finishOne(rowId:string,status:'PENDING'|'EXPORTED'|'DEAD',
  now:Date,retryMs=0,code?:string,exportedPayload?:unknown) {
  return finishTelemetrySpoolRow(rowId,status,now,RUN_ID,retryMs,code,exportedPayload);
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
    let symbolicationBudget=3;
    const releases = new Map<string, Awaited<ReturnType<typeof resolveTelemetryRelease>>>();
    for (const row of candidates) {
      if (!(await claimOne(row.id,clock(),options.environment))) continue;
      if(!ALLOWED_SERVICES.has(row.service)||!ALLOWED_ENVS.has(row.environment)||row.environment!==options.environment) {
        await finishOne(row.id,'DEAD',clock(),0,'UNSAFE_SERVICE_SCOPE');
        mobileTelemetryExportCounters.dead++;
        continue;
      }
      let symbolication: MobileSymbolication | undefined;
      let release: Awaited<ReturnType<typeof resolveTelemetryRelease>> | undefined;
      try {
        const e=parseMobileTelemetryEvent(row.payload);
        if(e.platform!=='web') {
          const scope={platform:e.platform,appVersion:e.appVersion,build:e.build,runtime:e.runtime,
            channel:e.channel,updateId:e.updateId,environment:options.environment};
          const key=JSON.stringify(scope);
          release=releases.get(key);
          if(!release) {
            release=await resolveTelemetryRelease(scope);
            releases.set(key,release);
          }
          if(e.stack)symbolication=await symbolize(e,release,options.environment,()=>symbolicationBudget-->0);
        }
      } catch { /* release enrichment must not suppress the original event */ }
      const result=await exportMobileTelemetryEvent({eventId:row.eventId,
        service:row.service,environment:row.environment,payload:row.payload,attempts:row.attempts,release,symbolication},options);
      if(result.kind==='suspended') {
        await finishOne(row.id,'PENDING',clock(),900_000,result.code);
        authSuspended=true;
        mobileTelemetryExportCounters.authBlocked++;bumpServiceOutcome(options.environment,row.service,'authBlocked');
        break;
      } else if(result.kind==='exported') {
        const finished=await finishOne(row.id,'EXPORTED',clock(),0,undefined,row.payload);
        if(finished) {
          try {
            const event=parseMobileTelemetryEvent(row.payload);
            failureMetrics.add(options.environment,event);
            if(event.performance)addMobilePerformance(event.platform,event.performance);
            if(event.platform==='ios'||event.platform==='android') {
              const delivery=deliveryCounters.get(event.platform)??{count:0,seconds:0};
              delivery.count++;delivery.seconds+=Math.max(0,(clock().getTime()-row.createdAt.getTime())/1000);
              deliveryCounters.set(event.platform,delivery);
              if(event.severity!=='INFO'&&event.severity!=='DEBUG') {
                recordDiagnosticQuality(event.platform,'total_errors');
                if(!event.stack)recordDiagnosticQuality(event.platform,'missing_stack');
                if(!event.errorCode||event.errorCode==='JS_UNKNOWN')recordDiagnosticQuality(event.platform,'unknown_code');
                if(!release||release.status==='unknown')recordDiagnosticQuality(event.platform,'unknown_release');
                if(symbolication?.status==='unavailable'||symbolication?.status==='unmapped')recordDiagnosticQuality(event.platform,'unmapped_stack');
              }
              if(event.health)for(const [field,value] of Object.entries(event.health)) {
                if(field==='pending'||field==='oldestMs')continue;
                const key=event.platform+'|'+field;
                clientHealthCounters.set(key,(clientHealthCounters.get(key)??0)+value);
              }
            }
          }catch{/* rejected data never enters metrics */}
        }
        if(finished){mobileTelemetryExportCounters.exported++;bumpServiceOutcome(options.environment,row.service,'exported');}
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
  if(timer)return true;
  if(env.GAFUS_TELEMETRY_EXPORT_ENABLED!=='true')return false;
  if(!ALLOWED_ENVS.has(env.GAFUS_TELEMETRY_ENVIRONMENT??''))return false;
  if(env.GAFUS_TELEMETRY_ENVIRONMENT==='production' &&
      env.GAFUS_TELEMETRY_PRODUCTION_APPROVED!=='true')return false;
  const endpoint=mobileOtlpLogsUrl(env);
  const dsn=env.UPTRACE_DSN;
  if(!endpoint||!dsn||dsn.length>4096||dsn.length<12)return false;
  const environment=env.GAFUS_TELEMETRY_ENVIRONMENT as 'preview'|'production';
  timer=setInterval(()=>void drainMobileTelemetrySpool({endpoint,dsn,environment}),PERIOD_MS);
  timer.unref?.();
  void drainMobileTelemetrySpool({endpoint,dsn,environment});
  logger.info('SDK57 durable telemetry worker enabled', {environment:env.GAFUS_TELEMETRY_ENVIRONMENT??'unknown'});
  return true;
}

export function stopMobileTelemetryExportWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}

/** Fixed-cardinality Prometheus metrics; only worker-internal endpoint exposes them. */
export async function renderMobileTelemetryMetricsPrometheus(
  environment: string = process.env.GAFUS_TELEMETRY_ENVIRONMENT ?? '',
): Promise<string> {
  if (!ALLOWED_ENVS.has(environment)) return '# gafus_mobile_telemetry_metrics_disabled 1\n';
  const day = new Date(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
  const scope=environment as 'preview'|'production';
  const [snapshot,serviceBacklog,sessionHealth]=await Promise.all([
    snapshotTelemetrySpool(scope,day),snapshotTelemetrySpoolByService(scope),snapshotMobileSessionHealth(scope,new Date()),
  ]);
  const {pending,leased,dead,oldestAgeSeconds,acceptedEvents,acceptedBytes}=snapshot;
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
    '# TYPE gafus_mobile_telemetry_oldest_age_seconds gauge',
    `gafus_mobile_telemetry_oldest_age_seconds{environment="${environment}"} ${oldestAgeSeconds}`,
    ...failureMetrics.render(environment),
    '# TYPE gafus_mobile_telemetry_quality_total counter',
    ...['ios','android'].flatMap(platform=>['total_errors','missing_stack','unknown_code','unknown_release','unmapped_stack'].map(outcome=>
      `gafus_mobile_telemetry_quality_total{environment="${environment}",platform="${platform}",outcome="${outcome}"} ${qualityCounters.get(platform+'|'+outcome)??0}`)),
    '# TYPE gafus_mobile_telemetry_delivery_seconds_total counter',
    ...['ios','android'].map(platform=>`gafus_mobile_telemetry_delivery_seconds_total{environment="${environment}",platform="${platform}"} ${deliveryCounters.get(platform)?.seconds??0}`),
    '# TYPE gafus_mobile_telemetry_delivery_events_total counter',
    ...['ios','android'].map(platform=>`gafus_mobile_telemetry_delivery_events_total{environment="${environment}",platform="${platform}"} ${deliveryCounters.get(platform)?.count??0}`),
    '# TYPE gafus_mobile_telemetry_client_health_total counter',
    ...['ios','android'].flatMap(platform=>['dropped','incompatible','storageReadFailures','storageWriteFailures','uploadFailures','invalidQueue'].map(outcome=>
      `gafus_mobile_telemetry_client_health_total{environment="${environment}",platform="${platform}",outcome="${outcome}"} ${clientHealthCounters.get(platform+'|'+outcome)??0}`)),
    '# TYPE gafus_mobile_telemetry_js_sessions_24h gauge',
    ...sessionHealth.map(row=>`gafus_mobile_telemetry_js_sessions_24h{environment="${environment}",platform="${row.platform}"} ${row.sessions}`),
    '# TYPE gafus_mobile_telemetry_js_error_sessions_24h gauge',
    ...sessionHealth.map(row=>`gafus_mobile_telemetry_js_error_sessions_24h{environment="${environment}",platform="${row.platform}"} ${row.errorSessions}`),
    '# TYPE gafus_mobile_telemetry_installations_24h gauge',
    ...sessionHealth.map(row=>`gafus_mobile_telemetry_installations_24h{environment="${environment}",platform="${row.platform}"} ${row.installations}`),
    '# TYPE gafus_mobile_telemetry_error_occurrences_24h gauge',
    ...sessionHealth.map(row=>`gafus_mobile_telemetry_error_occurrences_24h{environment="${environment}",platform="${row.platform}"} ${row.errors}`),
    '# TYPE gafus_mobile_telemetry_fatal_events_24h gauge',
    ...sessionHealth.map(row=>`gafus_mobile_telemetry_fatal_events_24h{environment="${environment}",platform="${row.platform}"} ${row.fatalEvents}`),
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
  return [...lines,...renderMobilePerformance(environment)].join('\n')+'\n';
}
