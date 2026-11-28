/** Strict Expo Observe SDK57 preview metrics wire adapter.
 * No arbitrary dimensions, routes, GPS, user/device/session IDs, or
 * direct client credentials can reach the cloud.
 *
 * Important: native Observe retains unacknowledged metrics on-device;
 * The direct metrics exporter is preview-only; production startup samples
 * are normalized into the existing durable telemetry spool.
 */
import {createHash} from 'node:crypto';
import {mobilePerformanceBounds, parseMobileTelemetryEvent, type MobileTelemetryEventV1,
  type MobilePerformanceMetric} from '@gafus/types';
import {scopeFromResource, InvalidObservePayload} from './observe-normalizer.js';
import type {ObserveReleaseScope} from '@gafus/mobile-ota-server/diagnostics-contracts';

const ALLOWED=new Set([
  'expo.app_startup.tti',
  'expo.app_startup.ttr',
  'expo.app_startup.cold_launch_time',
  'expo.app_startup.warm_launch_time',
  'expo.app_startup.bundle_load_time',
  'expo.app_startup.load_time',
  'expo.app_startup.launch_time',
  'expo.updates.download_time',
  'expo.navigation.cold_ttr',
  'expo.navigation.warm_ttr',
  'expo.navigation.tti',
]);
const ENDPOINT='https://api.uptrace.dev/v1/metrics';
const MAX_RESOURCES=8,MAX_SCOPE_METRICS=4,MAX_METRICS=32,MAX_POINTS=64;
const obj=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const invalid=(code:string):never=>{throw new InvalidObservePayload(code);};
const safeTimestamp=(raw:unknown,now:number):string => {
  if(typeof raw!=='string'||!/^\d{16,19}$/.test(raw))
    return invalid('OBSERVE_METRIC_TIMESTAMP_INVALID');
  const ms=Number(BigInt(raw)/1000000n);
  if(!Number.isFinite(ms)||Math.abs(now-ms)>7*86400000)
    return invalid('OBSERVE_METRIC_TIMESTAMP_OUT_OF_RANGE');
  return (BigInt(ms)*1000000n).toString();
};
const safeValue=(point:Record<string,unknown>):number=>{
  if(Object.keys(point).some(key=>![
    'timeUnixNano','startTimeUnixNano','asDouble','asInt','attributes','flags',
  ].includes(key)))return invalid('OBSERVE_METRIC_FIELD_NOT_ALLOWED');
  const raw=point.asDouble??point.asInt;
  const value=typeof raw==='string'?Number(raw):raw;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>3600)
    return invalid('OBSERVE_METRIC_VALUE_OUT_OF_RANGE');
  return value;
};
export type SanitizedObserveMetrics={
  scopes:ObserveReleaseScope[];
  metricPoints:number;
  payload:{resourceMetrics:Array<{
    resource:{attributes:Array<{key:string,value:{stringValue:string}}>};
    scopeMetrics:Array<{scope:{name:string},metrics:Array<{
      name:string,unit:string,gauge:{
        dataPoints:Array<{timeUnixNano:string,asDouble:number}>;
      };
    }>}>
  }>};
};
const a=(key:string,v:string)=>({key,value:{stringValue:v}});

export function normalizeObserveMetrics(raw:unknown,now=Date.now(),options:{nativeStartupOnly?:boolean}={}):SanitizedObserveMetrics {
  if(!obj(raw)||Object.keys(raw).some(k=>k!=='resourceMetrics')||
     !Array.isArray(raw.resourceMetrics)||!raw.resourceMetrics.length||
     raw.resourceMetrics.length>MAX_RESOURCES)
    return invalid('OBSERVE_METRICS_INVALID_ENVELOPE');
  const scopes:ObserveReleaseScope[]=[];
  const resourceMetrics:SanitizedObserveMetrics['payload']['resourceMetrics']=[];
  let metricCount=0,metricPoints=0;
  for(const batch of raw.resourceMetrics) {
    if(!obj(batch)||!obj(batch.resource)||!Array.isArray(batch.scopeMetrics)||
       !batch.scopeMetrics.length||batch.scopeMetrics.length>MAX_SCOPE_METRICS)
      return invalid('OBSERVE_METRICS_INVALID_RESOURCE');
    const scope=scopeFromResource(batch.resource);
    scopes.push(scope);
    const cleanScopes:SanitizedObserveMetrics['payload']['resourceMetrics'][number]['scopeMetrics']=[];
    for(const block of batch.scopeMetrics) {
      if(!obj(block)||!Array.isArray(block.metrics)||!block.metrics.length)
        return invalid('OBSERVE_METRICS_INVALID_SCOPE');
      const metrics:typeof cleanScopes[number]['metrics']=[];
      for(const metric of block.metrics) {
        metricCount++;
        if(metricCount>MAX_METRICS)return invalid('OBSERVE_METRICS_BATCH_TOO_LARGE');
        if(options.nativeStartupOnly && obj(metric) && typeof metric.name==='string' &&
           !Object.prototype.hasOwnProperty.call(NATIVE_STARTUP,metric.name))continue;
        if(!obj(metric)||typeof metric.name!=='string'||!ALLOWED.has(metric.name)||
           metric.unit!=='s'||!obj(metric.gauge)||
           metric.sum!==undefined||metric.histogram!==undefined||
           !Array.isArray(metric.gauge.dataPoints)||!metric.gauge.dataPoints.length||
           metric.gauge.dataPoints.length>10)
          return invalid('OBSERVE_METRIC_NOT_ALLOWED');
        const points:typeof metrics[number]['gauge']['dataPoints']=[];
        for(const p of metric.gauge.dataPoints){
          if(!obj(p))return invalid('OBSERVE_METRIC_POINT_INVALID');
          metricPoints++;
          if(metricPoints>MAX_POINTS)return invalid('OBSERVE_METRICS_TOO_MANY_POINTS');
          // Remove ALL native dimension attributes, even routeName / update ID:
          // only fixed service/platform/release attributes are permitted.
          points.push({timeUnixNano:safeTimestamp(p.timeUnixNano,now),
            asDouble:safeValue(p)});
        }
        metrics.push({name:metric.name,unit:'s',gauge:{dataPoints:points}});
      }
      cleanScopes.push({scope:{name:'gafus.expo-observe-safe'},metrics});
    }
    resourceMetrics.push({resource:{attributes:[
      a('service.name','gafus-mobile-'+scope.platform),
      a('service.namespace','gafus'),
      a('deployment.environment.name',scope.environment),
      a('service.version',scope.appVersion),
      a('gafus.release.build',scope.build),
    ]},scopeMetrics:cleanScopes});
  }
  return {scopes,metricPoints,payload:{resourceMetrics}};
}
/** Production startup data uses the existing durable spool/Alloy path,
 * not a second direct OTLP metrics producer. Each accepted point has a
 * stable replay identity. Expo session IDs are never exported. */
const NATIVE_STARTUP: Readonly<Record<string,MobilePerformanceMetric>> = {
  'expo.app_startup.tti':'NATIVE_STARTUP_TTI',
  'expo.app_startup.ttr':'NATIVE_STARTUP_TTR',
  'expo.app_startup.cold_launch_time':'NATIVE_COLD_LAUNCH',
  'expo.app_startup.warm_launch_time':'NATIVE_WARM_LAUNCH',
  'expo.app_startup.bundle_load_time':'NATIVE_BUNDLE_LOAD',
  'expo.app_startup.load_time':'NATIVE_STARTUP_LOAD',
  'expo.app_startup.launch_time':'NATIVE_LAUNCH',
};
function metricUuid(value:unknown):string {
  const h=createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${((parseInt(h[16]!,16)&3)|8).toString(16)}${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function nativeStartupEvents(raw:unknown,safe:SanitizedObserveMetrics):MobileTelemetryEventV1[] {
  // The SDK writes session.id on the data point, not the resource.
  // Consume only a bounded identity for replay deduplication, then discard it.
  const input=raw as {resourceMetrics:Array<{resource:{attributes:unknown[]},
    scopeMetrics:Array<{metrics:Array<{name:string,gauge?:{dataPoints:Array<Record<string,unknown>>}}>}>}>};
  const events=new Map<string,MobileTelemetryEventV1>();
  const sessionId=(attrs:unknown):string|undefined=>{
    const a=Array.isArray(attrs)?attrs.find(item=>obj(item)&&item.key==='session.id'):undefined;
    return obj(a)&&obj(a.value)&&typeof a.value.stringValue==='string'&&a.value.stringValue.length<=128
      ? a.value.stringValue : undefined;
  };
  for(const [index,resource] of input.resourceMetrics.entries()){
    const scope=safe.scopes[index]!;
    for(const block of resource.scopeMetrics)for(const metric of block.metrics){
      if(!Object.prototype.hasOwnProperty.call(NATIVE_STARTUP,metric.name))continue;
      const name=NATIVE_STARTUP[metric.name]!;
      for(const point of metric.gauge!.dataPoints){
        const timeUnixNano=safeTimestamp(point.timeUnixNano,Date.now());
        const value=safeValue(point),ms=Math.min(300000,Math.round(value*1000));
        const source=sessionId(point.attributes)??sessionId(resource.resource.attributes);
        const eventId=metricUuid([scope,source??null,metric.name,timeUnixNano,value]);
        const buckets=mobilePerformanceBounds.map((_,i)=>i===mobilePerformanceBounds.findIndex(b=>ms<=b)?1:0);
        events.set(eventId,parseMobileTelemetryEvent({
          schemaVersion:1,eventId,appStartId:eventId,platform:scope.platform,kind:'performance_summary',
          severity:'INFO',occurredAt:new Date(Number(BigInt(timeUnixNano)/1000000n)).toISOString(),
          appVersion:scope.appVersion,build:scope.build,runtime:scope.runtime,channel:scope.channel,
          updateId:'unknown',performance:[{metric:name,count:1,sumMs:ms,buckets}],
        }));
      }
    }
  }
  return [...events.values()];
}
export type MetricsExportResult={ok:boolean;status:number;errorCode?:string};
export async function exportObserveMetrics(
  safe:SanitizedObserveMetrics,
  {env=process.env,fetchImpl=fetch}:{env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch}={},
):Promise<MetricsExportResult>{
  if(env.GAFUS_OBSERVE_METRICS_ENABLED!=='true'||
     env.GAFUS_TELEMETRY_ENVIRONMENT!=='preview')
    return {ok:false,status:503,errorCode:'OBSERVE_METRICS_DISABLED'};
  const dsn=env.UPTRACE_DSN;
  if(!dsn||dsn.length<12||dsn.length>4096||/[\r\n\x00-\x1f]/.test(dsn))
    return {ok:false,status:503,errorCode:'OBSERVE_METRICS_INGEST_CREDENTIAL_REQUIRED'};
  let response:Response;
  try{
    response=await fetchImpl(ENDPOINT,{
      method:'POST',
      headers:{'content-type':'application/json','uptrace-dsn':dsn},
      body:JSON.stringify(safe.payload),
      redirect:'error',signal:AbortSignal.timeout(5000),
    });
  }catch{
    return {ok:false,status:503,errorCode:'OBSERVE_METRICS_UPTRACE_UNAVAILABLE'};
  }
  if(!response.ok)
    return {ok:false,status:503,errorCode:
      [401,403].includes(response.status)?'OBSERVE_METRICS_AUTH_CONFIGURATION':'OBSERVE_METRICS_UPSTREAM_REJECT'};
  if(response.status===204)return {ok:true,status:200};
  let body:unknown;
  try{
    const content=await response.text();
    if(content.length>4096)return {ok:false,status:503,errorCode:'OBSERVE_METRICS_ACK_INVALID'};
    body=content.trim()?JSON.parse(content):{};
  }catch{return {ok:false,status:503,errorCode:'OBSERVE_METRICS_ACK_INVALID'};}
  if(!obj(body))return {ok:false,status:503,errorCode:'OBSERVE_METRICS_ACK_INVALID'};
  if(body.partialSuccess!==undefined){
    if(!obj(body.partialSuccess))return {ok:false,status:503,errorCode:'OBSERVE_METRICS_ACK_INVALID'};
    const raw=body.partialSuccess.rejectedDataPoints;
    const rejected=raw===undefined?0:typeof raw==='string'?Number(raw):raw;
    if(typeof rejected!=='number'||!Number.isSafeInteger(rejected)||
       rejected<0||rejected>safe.metricPoints)
      return {ok:false,status:503,errorCode:'OBSERVE_METRICS_ACK_INVALID'};
    if(rejected>0)return {ok:false,status:503,errorCode:'OBSERVE_METRICS_PARTIAL_ACK'};
  }
  return {ok:true,status:200};
}
