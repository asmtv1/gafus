/** Native Expo Observe SDK57 preview OTLP/JSON endpoint.
 * No production enable path; normalized errors only. Never forward raw OTLP. */
import { Hono } from 'hono';
import { decodeBoundedJson } from './mobile-telemetry.js';
import { normalizeObserveLogs, InvalidObservePayload } from '../../modules/mobile-telemetry/observe-normalizer.js';
import { observePreviewRepository, ObservePreviewStoreError, verifyObserveReleaseScopes, reserveObserveMetricsDailyQuota,
  type ObservePreviewRepository } from '../../modules/mobile-telemetry/observe-repository.js';
import {normalizeObserveMetrics,exportObserveMetrics,
  type SanitizedObserveMetrics, type MetricsExportResult} from '../../modules/mobile-telemetry/observe-metrics.js';
import type {ObserveReleaseScope} from '@gafus/mobile-ota-server/diagnostics-contracts';
import { TelemetryIngressRateGate } from '../../modules/mobile-telemetry/ingest.js';
const PROJECT_ID='6c36fab5-6226-450f-8ee5-64e9beeea7db';
const rate=new TelemetryIngressRateGate(100,10);
export function createObservePreviewRoutes(options:{
  env?:NodeJS.ProcessEnv;repo?:ObservePreviewRepository;gate?:TelemetryIngressRateGate;
  verifyReleaseScopes?:(scopes:ObserveReleaseScope[])=>Promise<void>;
  reserveMetricQuota?:(points:number,bytes:number)=>Promise<void>;
  exportMetrics?:(metrics:SanitizedObserveMetrics)=>Promise<MetricsExportResult>;
}={}) {
  const env=options.env??process.env;
  const repo=options.repo??observePreviewRepository;
  const ingress=options.gate??rate;
  const verify=options.verifyReleaseScopes??verifyObserveReleaseScopes;
  const reserveMetricQuota=options.reserveMetricQuota??reserveObserveMetricsDailyQuota;
  const sendMetrics=options.exportMetrics??((safe:SanitizedObserveMetrics)=>exportObserveMetrics(safe,{env}));
  const app=new Hono();
  app.use('*',async(c,next)=>{
    c.header('Cache-Control','no-store');
    c.header('Referrer-Policy','no-referrer');
    c.header('X-Content-Type-Options','nosniff');
    await next();
  });
  const allowed=(projectId:string)=>
    env.GAFUS_OBSERVE_EXPERIMENT_INGEST_ENABLED==='true' &&
    env.GAFUS_TELEMETRY_ENVIRONMENT==='preview' &&
    env.GAFUS_OBSERVE_EXPERIMENT_PROJECT_ID===PROJECT_ID &&
    projectId===PROJECT_ID;
  app.post('/:projectId/v1/logs',async c=>{
    if(!allowed(c.req.param('projectId')))return c.json({error:'OBSERVE_PREVIEW_DISABLED'},503);
    if(!ingress.consume(null))return c.json({error:'OBSERVE_RATE_LIMIT'},429);
    try{
      const raw=await decodeBoundedJson(c.req.raw,256*1024);
      const normalized=normalizeObserveLogs(raw);
      if(normalized.events.length)await repo.store(normalized.events,normalized.scopes);
      // A success-with-partial rejection is understood by Expo Observe's
      // native dispatcher, allowing its cursor to advance safely.
      return c.json(normalized.rejectedLogCount>0?{
        partialSuccess:{rejectedLogRecords:normalized.rejectedLogCount},
      }:{},200);
    }catch(err){
      if(err instanceof ObservePreviewStoreError)return c.json({error:err.code},err.status as 400);
      if(err instanceof InvalidObservePayload)return c.json({error:err.code},400);
      if(err instanceof Error && 'status' in err){
        const status=(err as {status:number}).status;
        if([400,413,415].includes(status))return c.json({error:'OBSERVE_BAD_REQUEST'},status as 400);
      }
      return c.json({error:'OBSERVE_STORAGE_UNAVAILABLE'},503);
    }
  });
  // Preview only. Explicit metric allowlist, native release verified in Core,
  // 64 KiB body budget, no dynamic attributes, no Uptrace token in clients.
  // Device-side Observe retries on 503 and receives success only after a
  // full upstream OTLP acknowledgement.
  app.post('/:projectId/v1/metrics',async c=>{
    if(!allowed(c.req.param('projectId')))return c.json({error:'OBSERVE_PREVIEW_DISABLED'},503);
    if(env.GAFUS_OBSERVE_METRICS_ENABLED!=='true')
      return c.json({error:'OBSERVE_METRICS_NOT_ENABLED'},501);
    if(!ingress.consume(null))return c.json({error:'OBSERVE_RATE_LIMIT'},429);
    try{
      const raw=await decodeBoundedJson(c.req.raw,64*1024);
      const normalized=normalizeObserveMetrics(raw);
      await verify(normalized.scopes);
      await reserveMetricQuota(normalized.metricPoints,Buffer.byteLength(JSON.stringify(normalized.payload)));
      const sent=await sendMetrics(normalized);
      if(!sent.ok)return c.json({error:sent.errorCode??'OBSERVE_METRICS_UPSTREAM_FAILURE'},503);
      return c.json({},200);
    }catch(error){
      if(error instanceof ObservePreviewStoreError)
        return c.json({error:error.code},error.status as 400);
      if(error instanceof InvalidObservePayload)
        return c.json({error:error.code},400);
      if(error instanceof Error&&'status' in error){
        const status=(error as {status:number}).status;
        if([400,413,415].includes(status))
          return c.json({error:'OBSERVE_METRICS_BAD_REQUEST'},status as 400);
      }
      return c.json({error:'OBSERVE_METRICS_STORAGE_UNAVAILABLE'},503);
    }
  });
  return app;
}
export const observePreviewRoutes=createObservePreviewRoutes();
