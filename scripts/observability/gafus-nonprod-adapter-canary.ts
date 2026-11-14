/** Real GAFUS code-path preview test: Logger SDK + Worker OTLP exporter.
 * Skips PostgreSQL/Hono: this proves SDK -> cloud but NOT durable spool.
 * Invoke only with explicit project 9383 private 0600 DSN.
 */
import { randomUUID } from 'node:crypto';
import { createWebLogger } from '@gafus/logger';
import {
 configureServerTelemetry, startCorrelatedSpan, withServerSpan,
 markServerSpanError, writeCorrelatedDiagnostic, renderServerDiagnosticOtlpMetrics,
 flushServerTelemetry, shutdownServerTelemetry,
} from '@gafus/logger/server-telemetry';
import {readCanaryDsn} from './uptrace-nonprod-canary.mjs';
import {exportMobileTelemetryEvent} from '../../packages/worker/src/mobile-telemetry-export.ts';
const main=async()=>{
 const dsn=await readCanaryDsn();
 const env={
   GAFUS_TELEMETRY_ENVIRONMENT:'preview',
   GAFUS_SERVICE_VERSION:'nonprod-canary',
   OTEL_TRACES_SAMPLER_ARG:'1',
   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:'https://api.uptrace.dev/v1/traces',
   OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:'https://api.uptrace.dev/v1/logs',
   GAFUS_UPTRACE_LOGS_ENABLED:'true',
   UPTRACE_DSN:dsn,
 };
 if(!configureServerTelemetry('gafus-api',env))
   throw Error('LOGGER_OTEL_UNAVAILABLE');
 try{
  const root=startCorrelatedSpan({name:'gafus.canary.api-operation',
   service:'gafus-api',kind:'server',attributes:{
    'gafus.stage':'nonprod-canary', 'http.request.method':'GET',
   }});
  await withServerSpan(root,async()=>{
    const child=startCorrelatedSpan({name:'gafus.canary.dependency',
      service:'gafus-api',kind:'client',attributes:{'peer.service':'gafus-worker'}});
    markServerSpanError(child,'CANARY_EXPECTED_ERROR');
    child.end();
  });
  root.end();
  writeCorrelatedDiagnostic({
   level:'error',service:'gafus-api',event:'diagnostic.nonprod_canary',
   errorCode:'CANARY_EXPECTED',
  });
  // Prove the normal app logger path, not only the dedicated telemetry API.
  const syntheticError=new TypeError('Synthetic nonprod diagnostic, no user data');
  syntheticError.stack='TypeError: synthetic nonprod only\n    at GafusNonprodCanary (/private/local/client.ts:123:45)';
  createWebLogger('nonprod-canary').error(
    'GAFUS_NONPROD_SYNTHETIC_LOGGER_ERROR',syntheticError,
  );
  await flushServerTelemetry();
  const metrics=renderServerDiagnosticOtlpMetrics();
  if(!metrics.includes('gafus_server_diagnostic_otlp_accepted_total 2')||
     !metrics.includes('gafus_server_diagnostic_otlp_queue 0'))
    throw Error('LOGGER_OTLP_LOG_NOT_ACKNOWLEDGED');
 }finally{await shutdownServerTelemetry();}

 const event={
  schemaVersion:1 as const,eventId:randomUUID(),appStartId:randomUUID(),
  platform:'android' as const,kind:'js_fatal' as const,severity:'FATAL' as const,
  occurredAt:new Date().toISOString(),appVersion:'1.8.0',build:'25',
  runtime:'1.8.0',channel:'preview',updateId:'embedded',
  exceptionType:'CanaryError',errorCode:'CANARY_TEST_FATAL',
  stack:'at CanaryError (bundle:55:4)',
 };
 const exported=await exportMobileTelemetryEvent({
  eventId:event.eventId,service:'gafus-mobile-android',
  environment:'preview',payload:event,attempts:0,
 },{endpoint:'https://api.uptrace.dev/v1/logs',dsn});
 console.log(JSON.stringify({project:9383,serviceApi:'gafus-api',otelSdkFlushed:true,
  serviceMobile:'gafus-mobile-android',mobileExport:exported.kind}));
 if(exported.kind!=='exported')process.exitCode=3;
};
main().catch(()=>{console.error('GAFUS_NONPROD_ADAPTER_CANARY_FAILED');process.exitCode=4;});
