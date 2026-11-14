/** Private OTLP/HTTP JSON exporter for SDK57 diagnostic events.
 * Never import from a browser/mobile entry. The uptrace-dsn is process-only. */
import { parseMobileTelemetryEvent, parseMobileTraceparent, type MobileTelemetryEventV1 } from '@gafus/types';

const MAX_RESPONSE_BYTES = 4096;
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
export type MobileOtlpStatus = {kind:'exported'} |
  {kind:'retry';delayMs:number;code:string} |
  {kind:'suspended';code:'OTLP_AUTH_CONFIGURATION'} |
  {kind:'dead';code:string};
export type MobileSpoolLog = {
  eventId: string; service: string; environment: string;
  payload: unknown; attempts: number;
};
const attr = (key:string, value:string|number|boolean) => ({
  key, value:typeof value === 'string' ? {stringValue:value} :
    typeof value === 'number' ? {intValue:String(value)} : {boolValue:value},
});
const sev = (value:string):number => value === 'FATAL' ? 21
  : value === 'ERROR' ? 17 : value === 'WARN' ? 13 : value === 'INFO' ? 9 : 5;

export function buildMobileOtlpLog(row: MobileSpoolLog): object {
  // A second, independent allowlist on the outgoing side prevents accidental
  // vendor export of raw DB JSON, even if a write bypassed the API.
  const e:MobileTelemetryEventV1 = parseMobileTelemetryEvent(row.payload);
  const traceparent=parseMobileTraceparent(e.traceparent);
  const fields:ReturnType<typeof attr>[] = [
    attr('gafus.event_id', e.eventId),
    attr('gafus.event_kind',e.kind),
    attr('gafus.environment',row.environment),
    attr('gafus.platform',e.platform),
    attr('gafus.runtime_version',e.runtime),
    attr('gafus.update_id',e.updateId),
    attr('gafus.channel',e.channel),
    attr('gafus.app_start_id',e.appStartId),
    attr('app.version',e.appVersion),
    attr('app.build',e.build),
  ];
  if (e.exceptionType) fields.push(attr('exception.type',e.exceptionType));
  if (e.stack) fields.push(attr('exception.stacktrace',e.stack));
  if (e.errorCode) fields.push(attr('gafus.error_code',e.errorCode));
  if (e.operation) fields.push(attr('gafus.operation',e.operation));
  if (e.osVersion) fields.push(attr('os.version',e.osVersion));
  const occurred=BigInt(Date.parse(e.occurredAt)) * 1_000_000n;
  const body=e.errorCode ?? e.kind;
  const record:{timeUnixNano:string;severityNumber:number;severityText:string;
    body:{stringValue:string};attributes:ReturnType<typeof attr>[];
    traceId?:string;spanId?:string} = {
      timeUnixNano:occurred.toString(), severityNumber:sev(e.severity),
      severityText:e.severity, body:{stringValue:body}, attributes:fields,
    };
  if (traceparent) {
    const [,traceId,spanId]=traceparent.split('-');
    if (traceId && spanId) {record.traceId=traceId; record.spanId=spanId;}
  }
  return {resourceLogs:[{resource:{attributes:[
    attr('service.name',row.service),
    attr('deployment.environment.name',row.environment),
    attr('service.namespace','gafus'),
  ]},scopeLogs:[{scope:{name:e.platform==='web'?'gafus.browser-telemetry':'gafus.mobile-telemetry',
    version:'1.0.0'},logRecords:[record]}]}]};
}

export function mobileOtlpLogsUrl(env:NodeJS.ProcessEnv):string|null {
  const raw=env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
    ?? (env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/,'')+'/v1/logs' : null);
  if(!raw) return null;
  try{
    const parsed=new URL(raw);
    const local=['localhost','127.0.0.1','otel-collector'].includes(parsed.hostname);
    if (!((parsed.protocol==='https:' && parsed.hostname==='api.uptrace.dev') ||
          (parsed.protocol==='http:' && local)) ||
        parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.pathname!=='/v1/logs')return null;
    return parsed.toString();
  }catch{return null;}
}

export function mobileTelemetryBackoffMs(attempt:number,eventId:string,retryAfter?:string|null):number {
  let fromHeader=0;
  if(retryAfter) {
    const seconds=Number(retryAfter);
    if(Number.isFinite(seconds) && seconds>=0 && seconds<=900)
      fromHeader=Math.ceil(seconds*1000);
    else {
      const delta=Date.parse(retryAfter)-Date.now();
      if(Number.isFinite(delta) && delta>=0 && delta<=900_000) fromHeader=delta;
    }
  }
  const jitter=Number.parseInt(eventId.replace(/-/g,'').slice(0,4),16)%1000;
  return Math.min(900_000,Math.max(fromHeader,Math.min(900_000,2500*2**Math.min(8,attempt)))+jitter);
}

/** A single-event OTLP request avoids whole-batch loss on partial success.
 * Never include any event, DSN or HTTP response body in error messages. */
export async function exportMobileTelemetryEvent(row:MobileSpoolLog,options:{
  endpoint:string;dsn:string;fetchFn?:typeof fetch;
}):Promise<MobileOtlpStatus> {
  let body:string;
  try {body=JSON.stringify(buildMobileOtlpLog(row));}
  catch {return {kind:'dead',code:'EVENT_SCHEMA_REJECTED'};}
  const f=options.fetchFn??fetch;
  let response:Response;
  try {
    response=await f(options.endpoint,{
      method:'POST',headers:{'content-type':'application/json','uptrace-dsn':options.dsn},
      redirect:'error', body, signal:AbortSignal.timeout(5000),
    });
  } catch {
    return {kind:'retry',delayMs:mobileTelemetryBackoffMs(row.attempts,row.eventId),code:'NETWORK_UNAVAILABLE'};
  }
  if(!response.ok) {
    // Ingest credential failure is NOT a permanent event rejection.
    // Pause this exporter rather than losing fatal reports in a DLQ.
    if(response.status===401||response.status===403)
      return {kind:'suspended',code:'OTLP_AUTH_CONFIGURATION'};
    const next = RETRYABLE.has(response.status) || response.status>=500;
    return next ? {kind:'retry',delayMs:mobileTelemetryBackoffMs(row.attempts,row.eventId,response.headers.get('retry-after')),code:'OTLP_RETRYABLE'}
      : {kind:'dead',code:'OTLP_PERMANENT_REJECT'};
  }
  const responseType=response.headers.get('content-type')??'';
  if(responseType.toLowerCase().includes('json')) {
    let responseText:string;
    try { responseText=await response.text(); }
    catch { return {kind:'retry',delayMs:mobileTelemetryBackoffMs(row.attempts,row.eventId),code:'OTLP_UNKNOWN_ACK'}; }
    // OTLP may legitimately acknowledge with an empty body; a *nonempty*
    // invalid or oversized JSON response is an ambiguous acknowledgement.
    if(responseText.length>MAX_RESPONSE_BYTES)
      return {kind:'retry',delayMs:mobileTelemetryBackoffMs(row.attempts,row.eventId),code:'OTLP_UNKNOWN_ACK'};
    if(responseText.trim()) {
      let payload:{partialSuccess?:{rejectedLogRecords?:number}};
      try { payload=JSON.parse(responseText); }
      catch { return {kind:'retry',delayMs:mobileTelemetryBackoffMs(row.attempts,row.eventId),code:'OTLP_UNKNOWN_ACK'}; }
      const rejected=payload?.partialSuccess?.rejectedLogRecords??0;
      if(!Number.isInteger(rejected)||rejected<0)
        return {kind:'retry',delayMs:mobileTelemetryBackoffMs(row.attempts,row.eventId),code:'OTLP_UNKNOWN_ACK'};
      if(rejected>0)return {kind:'dead',code:'OTLP_PARTIAL_REJECT'};
    }
  }
  return {kind:'exported'};
}
