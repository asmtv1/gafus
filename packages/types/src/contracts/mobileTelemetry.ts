import { mobileDiagnosticScreens } from './mobileDiagnosticRoutes';
import { mobileDiagnosticCatalog } from './mobileDiagnosticCatalog';
/** Browser-safe v1 diagnostics contract. Never accept arbitrary error contexts or
 * payload fields. API reparses untrusted requests before durable storage. */
export type TelemetryPlatform = 'ios' | 'android' | 'web';
export type TelemetryKind = 'js_handled' | 'js_fatal' | 'react_error' |
  'promise_rejection' | 'native_crash' | 'native_exit' | 'native_hang' | 'anr' | 'oom' |
  'network_failure' | 'startup_failure' | 'session_start' | 'performance_summary' | 'telemetry_health';
export type TelemetrySeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export const mobileHttpEndpointGroups = ['AUTH','COURSES','TRAINING','TRAININGS','DAILY_COURSE','PETS','FEED','GALLERY','CHAT','CHATS','CHAT2','QUESTIONS','CONSULTATIONS','PAYMENTS','SUBSCRIPTIONS','APP_SUBSCRIPTION','REMINDERS','ARTICLES','GAFUS','PARTNERS','OFFLINE','ACHIEVEMENTS','USER','USERS','MEDIA','UPLOAD','PUBLIC','PUSH','NOTIFICATIONS','OTHER'] as const;
/** Fixed non-cumulative histogram boundaries in milliseconds, last bucket
 * covers the capped interval to 300000 ms. No route IDs or dynamic labels. */
export const mobilePerformanceBounds = [50,100,250,500,1000,2000,5000,10000,30000,300000] as const;
export const nativeStartupPerformanceMetrics = [
  'NATIVE_COLD_LAUNCH','NATIVE_WARM_LAUNCH','NATIVE_LAUNCH',
  'NATIVE_STARTUP_TTI','NATIVE_STARTUP_TTR','NATIVE_BUNDLE_LOAD','NATIVE_STARTUP_LOAD',
] as const;
export const mobilePerformanceMetrics = [
  ...nativeStartupPerformanceMetrics,
  'JS_STARTUP_READY','AUTH_RESTORE','OTA_CHECK','OTA_FETCH','API_MULTIPART',
  'SCREEN_READY','IMAGE_LOAD','IMAGE_CDN_FALLBACK','VIDEO_FIRST_FRAME','CHAT_FIRST_FRAME','TRAINING_FIRST_FRAME','MOMENTS_FIRST_FRAME',
  'TRAINING_DAYS_LOAD','TRAINING_STEPS_LOAD','FEED_FIRST_PAGE_LOAD','FEED_NEXT_PAGE_LOAD',
  'CHAT_ROOM_SYNC','CHAT_SEND','CHAT_CONNECT_GRANT','CHAT_SUBSCRIPTION_READY','FEED_PHOTO_UPLOAD','FEED_VIDEO_UPLOAD',
  'JS_TIMER_DELAY',
  'SCREEN_CATALOG_DATA_READY','SCREEN_FAVORITES_DATA_READY',
  'SCREEN_COURSE_DAYS_DATA_READY','SCREEN_COURSE_PREVIEW_DATA_READY',
  'SCREEN_COURSE_STEPS_DATA_READY','SCREEN_DAILY_COURSE_DATA_READY',
  'SCREEN_FEED_DATA_READY','SCREEN_FEED_DETAIL_DATA_READY',
  'SCREEN_CHAT_LIST_DATA_READY','SCREEN_CHAT_ROOM_DATA_READY',
  'SCREEN_PETS_DATA_READY','SCREEN_PROFILE_DATA_READY',
  'SCREEN_GALLERY_ALBUMS_DATA_READY','SCREEN_GALLERY_PHOTOS_DATA_READY',
  'SCREEN_QUESTIONS_DATA_READY','SCREEN_QUESTION_DETAIL_DATA_READY',
  'SCREEN_ARTICLES_DATA_READY','SCREEN_ARTICLE_DETAIL_DATA_READY',
  'SCREEN_CONSULTATIONS_DATA_READY','SCREEN_ACHIEVEMENTS_DATA_READY',
  'SCREEN_REMINDERS_DATA_READY','SCREEN_GUIDES_DATA_READY',
  ...mobileHttpEndpointGroups.map(group=>`API_${group}` as const),
] as const;
export type MobilePerformanceMetric = typeof mobilePerformanceMetrics[number];
export type MobilePerformanceHistogram = {
  metric:MobilePerformanceMetric; count:number; sumMs:number; buckets:number[];
};
export const mobileTelemetryHealthFields = ['dropped','incompatible','storageReadFailures','storageWriteFailures','uploadFailures','invalidQueue','pending','oldestMs'] as const;
export type MobileTelemetryHealth = Record<typeof mobileTelemetryHealthFields[number],number>;
export type MobileHttpDiagnostic = {
  method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE';
  endpointGroup:typeof mobileHttpEndpointGroups[number];
  category:'server'|'invalid_response'|'timeout'|'network'|'unknown';
  durationMs:number;
  retryCount:0|1;
  status?:number;
  serverTraceId?:string;
  clientTraceparent?:string;
};
export interface MobileTelemetryEventV1 {
  schemaVersion: 1;
  eventId: string;
  platform: TelemetryPlatform;
  kind: TelemetryKind;
  severity: TelemetrySeverity;
  occurredAt: string;
  appVersion: string;
  build: string;
  runtime: string;
  channel: string;
  updateId: string;
  appStartId: string;
  installationId?: string;
  routeScreen?: string;
  breadcrumbs?: { screen: string; ageMs: number }[];
  osVersion?: string;
  exceptionType?: string;
  errorCode?: string;
  operation?: string;
  module?: string;
  screen?: string;
  stackStatus?: "captured" | "unavailable" | "sanitized_empty";
  stack?: string;
  traceparent?: string;
  http?: MobileHttpDiagnostic;
  performance?: MobilePerformanceHistogram[];
  health?: MobileTelemetryHealth;
  occurrences?: number;
  lastOccurredAt?: string;
}
export interface MobileTelemetryBatchV1 {
  schemaVersion: 1;
  events: MobileTelemetryEventV1[];
}

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const SAFE_IDENTIFIER = /^[a-zA-Z0-9_.:/+-]{1,100}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][a-zA-Z\d.-]{1,24})?$/;
const TRACEPARENT = /^00-([a-f\d]{32})-([a-f\d]{16})-([a-f\d]{2})$/i;
const KINDS = new Set<TelemetryKind>([
  'js_handled', 'js_fatal', 'react_error', 'promise_rejection',
  'native_crash', 'native_exit', 'native_hang', 'anr', 'oom', 'network_failure', 'startup_failure', 'session_start', 'performance_summary', 'telemetry_health',
]);
const SEVERITIES = new Set<TelemetrySeverity>(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);
const PLATFORMS = new Set<TelemetryPlatform>(['ios', 'android', 'web']);
const KEYS = new Set([
  'schemaVersion', 'eventId', 'platform', 'kind', 'severity', 'occurredAt',
  'appVersion', 'build', 'runtime', 'channel', 'updateId', 'appStartId',
  'osVersion', 'exceptionType', 'errorCode', 'operation', 'stack', 'traceparent', 'module', 'screen', 'stackStatus', 'installationId', 'routeScreen', 'breadcrumbs', 'http', 'performance', 'health', 'occurrences', 'lastOccurredAt',
]);
const diagnosticContexts = new Set(Object.values(mobileDiagnosticCatalog).map(e => {
  const entry: {code:string;module:string;screen?:string;operation?:string} = e;
  return [entry.code,entry.module,entry.screen??'',entry.operation??''].join(':');
}));
const fnName = (input: string) => {
  const normalized = input.replace(/[^A-Za-z\d_.$<>-]/g, '_').slice(0, 100);
  return normalized && /[A-Za-z]/.test(normalized) ? normalized : 'anonymous';
};

/** Retain only function names and numeric JS locations / bounded native frames.
 * Deliberately discard Error.message, full URLs, user paths, query strings, and
 * arbitrary native excerpts (memory/register dumps and SQL). */
export function sanitizeMobileStack(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const frames: string[] = [];
  for (const raw of value.split(/[\r\n]/).slice(0, 160)) {
    if (frames.length >= 50) break;
    const line = raw.trim();
    if (!line || line.length > 4000) continue;
    // Already sanitized native frames must survive API and Worker parsing.
    const normalizedNative = /^at ([A-Za-z_$][A-Za-z\d_.$<>-]{0,99}) \(native(?::(\d{1,8}))?\)$/.exec(line);
    if (normalizedNative) { frames.push(line); continue; }
    // Hermes bytecode: at f (address at index.android.bundle:1:12345678).
    // Also support anonymous and async frames and JSC function@bundle.
    const jsPosition = /:(\d{1,8}):(\d{1,10})\)?\s*$/.exec(line);
    if (jsPosition) {
      const named = /^at\s+(?:async\s+)?([A-Za-z_$<>][A-Za-z\d_.$<>-]{0,99})\s+\(/.exec(line);
      const jsc = /^([A-Za-z_$<>][A-Za-z\d_.$<>-]{0,99})?@/.exec(line);
      const anonymous = /^at\s+(?:async\s+)?(?:address at\s+|\(|[^\s()]+:\d)/.test(line);
      if (named || jsc || anonymous) {
        // Preserve only a Metro content hash from a recognized logical bundle
        // name, never a full path, query, or a caller-selected filename.
        const bundleId=/(?:^|[ /(@])(?:widget-entry|entry|index|AppEntry)-([a-f0-9]{32}|[a-f0-9]{64})\.hbc:\d{1,8}:\d{1,10}\)?$/.exec(line)?.[1]
          ?? / \(bundle-([a-f0-9]{32}|[a-f0-9]{64}):\d{1,8}:\d{1,10}\)$/.exec(line)?.[1];
        frames.push(`at ${fnName(named?.[1]??jsc?.[1]??'anonymous')} (bundle${bundleId?'-'+bundleId:''}:${Number(jsPosition[1])}:${Number(jsPosition[2])})`);
        continue;
      }
    }
    // JVM/Kotlin: at com.gafus.Work.run(Work.kt:104), no user file paths.
    const java = /^at\s+([a-zA-Z_$][a-zA-Z\d_.$<>]*)\([^():/]{1,80}:(\d{1,8})\)$/.exec(line);
    if (java) {
      frames.push(`at ${fnName(java[1]!)} (native:${Number(java[2])})`);
      continue;
    }
    // iOS MetricKit: "applicationDidBecomeActive (Gafus + 19160)" or
    // "Gafus + 19160". Keep only audited binary/symbol tokens + relative
    // offsets, never raw PC addresses, source paths or exception messages.
    const iosNamed = /^([A-Za-z_$][A-Za-z\d_.$<>-]{0,99}) \(([A-Za-z\d_.-]{1,64}) \+ (\d{1,10})\)$/.exec(line);
    if(iosNamed){
      frames.push(`${iosNamed[2]}!${fnName(iosNamed[1]!)}+0x${Number(iosNamed[3]).toString(16)}`);
      continue;
    }
    const iosOffset=/(?:^|\()([A-Za-z\d_.-]{1,64}) \+ (\d{1,10})\)?$/.exec(line);
    if(iosOffset){
      frames.push(`${iosOffset[1]}+0x${Number(iosOffset[2]).toString(16)}`);
      continue;
    }
    // Android historical exit diagnostics may provide a bare class method.
    // Only static Java namespaces are accepted, no user-controlled paths.
    const bareJvm=/^(?:(?:com|io|java|javax|android|androidx|kotlin|expo|org|ru)\.)[A-Za-z\d_.$<>-]{3,130}$/.exec(line);
    if(bareJvm){frames.push(`at ${fnName(line)} (native)`);continue;}
    // Native symbolic offsets, module and symbol only: libfoo.so!function+0x123.
    const native = /^([a-zA-Z\d_.-]{1,64})!([a-zA-Z\d_.$<>-]{1,100})\+0x([a-f\d]{1,16})$/i.exec(line);
    if (native) {
      frames.push(`${native[1]}!${fnName(native[2]!)}+0x${native[3]!.toLowerCase()}`);
      continue;
    }
    // Native unresolved PC: libfoo.so+0xabcdef (no memory dumps).
    const pc = /^([a-zA-Z\d_.-]{1,64})\+0x([a-f\d]{1,16})$/i.exec(line);
    if (pc) frames.push(`${pc[1]}+0x${pc[2]!.toLowerCase()}`);
  }
  const output = frames.join('\n');
  return output || undefined;
}

export function parseMobileTraceparent(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = TRACEPARENT.exec(raw);
  if (!m || /^0+$/.test(m[1]!) || /^0+$/.test(m[2]!)) return undefined;
  return raw.toLowerCase();
}

function readSafeText(obj: Record<string, unknown>, key: string, max: number,
  regex: RegExp = SAFE_IDENTIFIER): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length > max || !regex.test(value))
    throw new Error(`TELEMETRY_FIELD_INVALID_${key}`);
  return value;
}
function readOptional(obj: Record<string, unknown>, key: string,
  max: number, regex: RegExp = SAFE_IDENTIFIER): string | undefined {
  return obj[key] === undefined ? undefined : readSafeText(obj, key, max, regex);
}

function parseHttpDiagnostic(raw:unknown):MobileHttpDiagnostic|undefined {
  if(raw===undefined)return;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('TELEMETRY_HTTP');
  const x=raw as Record<string,unknown>;
  const fields=['method','endpointGroup','category','durationMs','retryCount','status','serverTraceId','clientTraceparent'];
  if(Object.keys(x).some(k=>!fields.includes(k))||
    !['GET','POST','PUT','PATCH','DELETE'].includes(x.method as string)||
    !mobileHttpEndpointGroups.includes(x.endpointGroup as MobileHttpDiagnostic['endpointGroup'])||
    !['server','invalid_response','timeout','network','unknown'].includes(x.category as string)||
    (x.clientTraceparent!==undefined&&!parseMobileTraceparent(x.clientTraceparent))||
    !Number.isSafeInteger(x.durationMs)||Number(x.durationMs)<0||Number(x.durationMs)>300_000||
    (x.retryCount!==0&&x.retryCount!==1)||
    (x.status!==undefined&&(!Number.isInteger(x.status)||Number(x.status)<100||Number(x.status)>599))||
    (x.serverTraceId!==undefined&&(typeof x.serverTraceId!=='string'||! /^[a-f0-9]{32}$/i.test(x.serverTraceId)||/^0+$/.test(x.serverTraceId))))
    throw Error('TELEMETRY_HTTP');
  return {method:x.method as MobileHttpDiagnostic['method'],endpointGroup:x.endpointGroup as MobileHttpDiagnostic['endpointGroup'],
    category:x.category as MobileHttpDiagnostic['category'],durationMs:Number(x.durationMs),retryCount:x.retryCount,
    ...(x.status!==undefined?{status:Number(x.status)}:{}),
    ...(typeof x.serverTraceId==='string'?{serverTraceId:x.serverTraceId.toLowerCase()}:{}),
    ...(typeof x.clientTraceparent==='string'?{clientTraceparent:x.clientTraceparent.toLowerCase()}:{}),
  };
}
function parsePerformance(raw:unknown):MobilePerformanceHistogram[]|undefined {
  if(raw===undefined)return;
  if(!Array.isArray(raw)||raw.length<1||raw.length>mobilePerformanceMetrics.length)
    throw Error('TELEMETRY_PERFORMANCE');
  const seen=new Set<MobilePerformanceMetric>();
  return raw.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).some(k=>!['metric','count','sumMs','buckets'].includes(k))||
      !mobilePerformanceMetrics.includes(item.metric)||seen.has(item.metric)||
      !Number.isSafeInteger(item.count)||item.count<1||item.count>256||
      !Number.isSafeInteger(item.sumMs)||item.sumMs<0||item.sumMs>item.count*300_000||
      !Array.isArray(item.buckets)||item.buckets.length!==mobilePerformanceBounds.length||
      !item.buckets.every((n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=item.count)||
      item.buckets.reduce((a:number,b:number)=>a+b,0)!==item.count)
      throw Error('TELEMETRY_PERFORMANCE');
    seen.add(item.metric);
    return {metric:item.metric,count:item.count,sumMs:item.sumMs,buckets:[...item.buckets]};
  });
}
function parseHealth(raw:unknown):MobileTelemetryHealth|undefined {
  if(raw===undefined)return;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('TELEMETRY_HEALTH');
  const r=raw as Record<string,unknown>;
  if(Object.keys(r).length!==mobileTelemetryHealthFields.length||
    !mobileTelemetryHealthFields.every(key=>Number.isSafeInteger(r[key])&&Number(r[key])>=0&&
      Number(r[key])<=(key==='oldestMs'?604800000:key==='pending'?500:1000000)))
    throw Error('TELEMETRY_HEALTH');
  return Object.fromEntries(mobileTelemetryHealthFields.map(key=>[key,r[key]])) as MobileTelemetryHealth;
}
export function parseMobileTelemetryEvent(value: unknown): MobileTelemetryEventV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('TELEMETRY_EVENT_NOT_OBJECT');
  const e = value as Record<string, unknown>;
  if (Object.keys(e).some(k => !KEYS.has(k))) throw new Error('TELEMETRY_UNKNOWN_FIELD');
  if (e.schemaVersion !== 1) throw new Error('TELEMETRY_SCHEMA_VERSION');
  const eventId = readSafeText(e, 'eventId', 36, UUID);
  const appStartId = readSafeText(e, 'appStartId', 36, UUID);
  const installationId = readOptional(e, 'installationId', 36, UUID);
  const routeScreen = readOptional(e, 'routeScreen', 64, CODE);
  if (routeScreen && !mobileDiagnosticScreens.has(routeScreen)) throw new Error('TELEMETRY_ROUTE_SCREEN');
  let breadcrumbs: MobileTelemetryEventV1['breadcrumbs'];
  if (e.breadcrumbs !== undefined) {
    if (!Array.isArray(e.breadcrumbs) || e.breadcrumbs.length>12) throw new Error('TELEMETRY_BREADCRUMBS');
    breadcrumbs = e.breadcrumbs.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
          Object.keys(raw).some(k=>k!=='screen'&&k!=='ageMs') ||
          !mobileDiagnosticScreens.has(raw.screen) || !Number.isSafeInteger(raw.ageMs) ||
          raw.ageMs<0 || raw.ageMs>1_800_000) throw new Error('TELEMETRY_BREADCRUMB');
      return {screen:raw.screen,ageMs:raw.ageMs};
    });
  }
  const platform = e.platform;
  if (!PLATFORMS.has(platform as TelemetryPlatform)) throw new Error('TELEMETRY_PLATFORM');
  const kind = e.kind;
  if (!KINDS.has(kind as TelemetryKind)) throw new Error('TELEMETRY_KIND');
  const severity = e.severity;
  if (!SEVERITIES.has(severity as TelemetrySeverity)) throw new Error('TELEMETRY_SEVERITY');
  const occurredAt = readSafeText(e, 'occurredAt', 30, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const ms = Date.parse(occurredAt);
  if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > 7 * 24 * 60 * 60 * 1000)
    throw new Error('TELEMETRY_EVENT_TIME_WINDOW');
  const appVersion = readSafeText(e, 'appVersion', 48, VERSION);
  const build = readSafeText(e, 'build', 40, /^[a-zA-Z0-9_.-]{1,40}$/);
  const runtime = readSafeText(e, 'runtime', 100, /^(?:[a-zA-Z0-9_.-]{1,100}|exposdk:\d+\.\d+\.\d+)$/);
  const channel = readSafeText(e, 'channel', 48, /^[a-zA-Z\d_.-]{1,48}$/);
  const updateId = readSafeText(e, 'updateId', 40, /^(?:embedded|unknown|[a-f\d-]{36})$/i);
  if (updateId === 'unknown') {
    if (platform === 'web' || !['native_crash','native_exit','native_hang','anr','oom','performance_summary'].includes(String(kind)))
      throw new Error('TELEMETRY_UPDATE_ID');
  } else if (updateId !== 'embedded' && !UUID.test(updateId)) throw new Error('TELEMETRY_UPDATE_ID');
  const osVersion = readOptional(e, 'osVersion', 20, /^\d{1,3}(?:\.\d{1,3}){0,2}$/);
  const exceptionType = readOptional(e, 'exceptionType', 100, /^[a-zA-Z_$][a-zA-Z\d_.$<>-]{0,99}$/);
  const errorCode = readOptional(e, 'errorCode', 64, CODE);
  const operation = readOptional(e, 'operation', 64, CODE);
  const module = readOptional(e, 'module', 64, CODE);
  const screen = readOptional(e, 'screen', 64, CODE);
  if ((module || screen) && !diagnosticContexts.has([errorCode??'',module??'',screen??'',operation??''].join(':')))
    throw new Error('TELEMETRY_DIAGNOSTIC_CONTEXT');
  const stack = sanitizeMobileStack(e.stack);
  const stackStatus = e.stackStatus;
  if (stackStatus !== undefined && stackStatus !== 'captured' && stackStatus !== 'unavailable' && stackStatus !== 'sanitized_empty')
    throw new Error('TELEMETRY_STACK_STATUS');
  const normalizedStackStatus = stack ? 'captured' : typeof e.stack === 'string' || stackStatus === 'captured' || stackStatus === 'sanitized_empty' ? 'sanitized_empty' : 'unavailable';
  if (typeof e.stack === 'string' && e.stack.length > 16_384) throw new Error('TELEMETRY_STACK_TOO_LARGE');
  const traceparent = parseMobileTraceparent(e.traceparent);
  const http = parseHttpDiagnostic(e.http);
  const occurrences=e.occurrences;
  if(occurrences!==undefined&&(!Number.isSafeInteger(occurrences)||Number(occurrences)<1||Number(occurrences)>1000||
    kind==='session_start'||kind==='performance_summary'||kind==='telemetry_health'))throw Error('TELEMETRY_OCCURRENCES');
  const lastOccurredAt=readOptional(e,'lastOccurredAt',30,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  if(lastOccurredAt && (!occurrences||Number(occurrences)<2||!Number.isFinite(Date.parse(lastOccurredAt))||
    Date.parse(lastOccurredAt)<ms||Date.parse(lastOccurredAt)-ms>30_000))throw Error('TELEMETRY_LAST_OCCURRENCE');
  const health=parseHealth(e.health);
  if((kind==='telemetry_health')!==Boolean(health)||health&&(platform==='web'||severity!=='INFO'))throw Error('TELEMETRY_HEALTH_KIND');
  const performance=parsePerformance(e.performance);
  if((kind==='performance_summary')!==Boolean(performance)||performance&&(severity!=='INFO'||platform==='web'))throw Error('TELEMETRY_PERFORMANCE_KIND');
  if(updateId==='unknown' && performance && performance.some(h=>
    !nativeStartupPerformanceMetrics.some(metric=>metric===h.metric))) throw Error('TELEMETRY_UPDATE_ID');
  return {
    schemaVersion: 1, eventId, platform: platform as TelemetryPlatform,
    kind: kind as TelemetryKind, severity: severity as TelemetrySeverity,
    occurredAt, appVersion, build, runtime, channel, updateId, appStartId,
    ...(installationId ? {installationId} : {}),
    ...(routeScreen ? {routeScreen} : {}),
    ...(breadcrumbs?.length ? {breadcrumbs} : {}),
    ...(osVersion ? {osVersion} : {}),
    ...(exceptionType ? {exceptionType} : {}),
    ...(errorCode ? {errorCode} : {}),
    ...(operation ? {operation} : {}),
    ...(module ? {module} : {}),
    ...(screen ? {screen} : {}),
    ...(stackStatus !== undefined || e.stack !== undefined ? {stackStatus: normalizedStackStatus} : {}),
    ...(stack ? {stack} : {}),
    ...(traceparent ? {traceparent} : {}),
    ...(http ? {http} : {}),
    ...(performance?{performance}:{}),
    ...(health?{health}:{}),
    ...(occurrences!==undefined?{occurrences:Number(occurrences)}:{}),
    ...(lastOccurredAt?{lastOccurredAt}:{}),
  };
}

/** Must be called AFTER imposing an HTTP byte-size cap, before database writes. */
export function parseMobileTelemetryBatch(raw: unknown): MobileTelemetryBatchV1 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('TELEMETRY_BATCH_NOT_OBJECT');
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some(k => k !== 'schemaVersion' && k !== 'events') || o.schemaVersion !== 1)
    throw new Error('TELEMETRY_BATCH_SCHEMA');
  if (!Array.isArray(o.events) || o.events.length < 1 || o.events.length > 50)
    throw new Error('TELEMETRY_BATCH_SIZE');
  const events = o.events.map(parseMobileTelemetryEvent);
  if (new Set(events.map(e => e.eventId)).size !== events.length) throw new Error('TELEMETRY_BATCH_DUPLICATE_ID');
  return { schemaVersion: 1, events };
}
