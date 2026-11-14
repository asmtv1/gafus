/** Expo Observe 57.0.28 preview OTLP/JSON logs wire adapter.
 * Native Observe has no custom authorization headers. Convert exclusively
 * known safe fields and discard all raw body, metadata and unknown attributes.
 * Replay fingerprints are SHA-256 based UUIDs, never raw client identity. */
import { createHash } from 'node:crypto';
import { parseMobileTelemetryEvent, sanitizeMobileStack,
  type MobileTelemetryEventV1 } from '@gafus/types';

const MAX_RESOURCES=8;
const MAX_SCOPES=4;
const MAX_LOG_RECORDS=50;
const MAX_ATTRS=50;
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const APP_VERSION=/^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const SAFE_KEY=/^[a-zA-Z\d._:/+-]{1,100}$/;
const KEY_SET=new Set([
  'os.name','os.version','os.type','expo.sdk.version','service.version',
  'expo.app.build_number','expo.app.updates.channel',
  'expo.app.updates.runtime_version','expo.app.updates.id','expo.app.update_id',
  'expo.environment','service.name','session.id','event.name',
  'exception.type','exception.stacktrace','exception.message',
]);
type SafeValue=string|number|boolean;
const isObj=(v:unknown):v is Record<string,unknown> => !!v&&typeof v==='object'&&!Array.isArray(v);
function stringValue(v:unknown):string|undefined {
  if(!isObj(v))return undefined;
  if(typeof v.stringValue==='string'&&v.stringValue.length<=16_384)return v.stringValue;
  return undefined;
}
function attributesToMap(raw:unknown):Record<string,string> {
  const out:Record<string,string>={};
  if(!Array.isArray(raw)||raw.length>MAX_ATTRS)return out;
  for(const attr of raw){
    if(!isObj(attr)||typeof attr.key!=='string'||!KEY_SET.has(attr.key))continue;
    const value=stringValue(attr.value);
    if(value!==undefined)out[attr.key]=value;
  }
  return out;
}
function deterministicUUID(input:unknown):string {
  const h=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  // RFC 4122 version 4 layout, deterministic digest for at-least-once replay.
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${((parseInt(h[16]!,16)&3)|8).toString(16)}${h.slice(17,20)}-${h.slice(20,32)}`;
}
function normalizeTime(raw:unknown):string|undefined {
  if(typeof raw!=='string' || !/^\d{13,19}$/.test(raw))return undefined;
  try{
    const ms=Number(BigInt(raw)/1000000n);
    if(!Number.isFinite(ms)||Math.abs(Date.now()-ms)>7*24*60*60*1000)return undefined;
    return new Date(ms).toISOString();
  }catch{return undefined;}
}
export class InvalidObservePayload extends Error {
  constructor(readonly code:string){super(code);}
}
import type { ObserveReleaseScope } from '@gafus/mobile-ota-server/diagnostics-contracts';
export type { ObserveReleaseScope } from '@gafus/mobile-ota-server/diagnostics-contracts';
export type NormalizedObserveBatch={
  events:MobileTelemetryEventV1[]; scopes:ObserveReleaseScope[];
  originalLogCount:number; rejectedLogCount:number;
};
function safeExceptionType(attrs:Record<string,string>):string|undefined {
  const type=attrs['exception.type'];
  return type&&/^[a-zA-Z_$][a-zA-Z\d_.$<>-]{0,99}$/.test(type)?type:undefined;
}
function classifyKind(eventName:string|undefined):MobileTelemetryEventV1['kind'] {
  if(eventName && /^(?:app\.crash|exception\.native|expo\.crash|native\.crash)/i.test(eventName))return 'native_crash';
  if(eventName && /^(?:js\.fatal|javascript\.fatal|exception\.js_unhandled)/i.test(eventName))return 'js_fatal';
  return 'js_handled'; // Unknown events aren't falsely labeled as native crashes.
}
function codeFromEventName(eventName:string|undefined):string {
  if(!eventName)return 'OBSERVE_ERROR';
  if(/crash/i.test(eventName))return 'OBSERVE_CRASH';
  if(/exception/i.test(eventName))return 'OBSERVE_EXCEPTION';
  if(/error/i.test(eventName))return 'OBSERVE_ERROR';
  return 'OBSERVE_LOG';
}
export function scopeFromResource(resource:Record<string,unknown>):ObserveReleaseScope {
  const attrs=attributesToMap(resource.attributes);
  if(!/^57\.0\.\d{1,3}$/.test(attrs['expo.sdk.version']??''))
    throw new InvalidObservePayload('OBSERVE_SDK_NOT_57');
  const platform=(attrs['os.type']==='darwin'||/ios|iphone/i.test(attrs['os.name']??''))?'ios':
    (attrs['os.type']==='linux'||/android/i.test(attrs['os.name']??''))?'android':null;
  if(!platform)throw new InvalidObservePayload('OBSERVE_PLATFORM_INVALID');
  const appVersion=attrs['service.version'];
  const build=attrs['expo.app.build_number'];
  const runtime=attrs['expo.app.updates.runtime_version'];
  const channel=attrs['expo.app.updates.channel'];
  if(!appVersion || !APP_VERSION.test(appVersion)||!build||!/^[a-zA-Z\d_.-]{1,40}$/.test(build)||
    !runtime||!SAFE_KEY.test(runtime)||!channel||!/^[a-zA-Z\d_.-]{1,48}$/.test(channel)||
    channel!=='preview')throw new InvalidObservePayload('OBSERVE_RELEASE_METADATA_REQUIRED');
  if(attrs['expo.environment'] && attrs['expo.environment']!=='preview')
    throw new InvalidObservePayload('OBSERVE_ENVIRONMENT_INVALID');
  return {platform,appVersion,build,runtime,channel,environment:'preview'};
}

/** Strict parser: even when sender supplies profile images, GPS, chat texts,
 * signed URLs or headers, not a single unknown field reaches the durable spool. */
export function normalizeObserveLogs(raw:unknown):NormalizedObserveBatch {
  if(!isObj(raw)||Object.keys(raw).some(k=>k!=='resourceLogs')||
    !Array.isArray(raw.resourceLogs)||raw.resourceLogs.length<1||
    raw.resourceLogs.length>MAX_RESOURCES)
    throw new InvalidObservePayload('OBSERVE_INVALID_ENVELOPE');
  const events:MobileTelemetryEventV1[]=[];
  const scopes:ObserveReleaseScope[]=[];
  let originalLogCount=0;
  let rejectedLogCount=0;
  for(const item of raw.resourceLogs){
    if(!isObj(item)||!isObj(item.resource)||!Array.isArray(item.scopeLogs)||
      item.scopeLogs.length>MAX_SCOPES)throw new InvalidObservePayload('OBSERVE_INVALID_RESOURCE');
    const scope=scopeFromResource(item.resource);scopes.push(scope);
    for(const collection of item.scopeLogs){
      if(!isObj(collection)||!Array.isArray(collection.logRecords)||
        collection.logRecords.length>MAX_LOG_RECORDS)
        throw new InvalidObservePayload('OBSERVE_INVALID_SCOPE');
      if(!isObj(collection.scope)||collection.scope.name!=='expo-observe')
        throw new InvalidObservePayload('OBSERVE_UNEXPECTED_SCOPE');
      for(const record of collection.logRecords){
        originalLogCount++;
        if(!isObj(record)){rejectedLogCount++;continue;}
        // Non-error Observe logs are dropped on purpose; mobile handled
        // telemetry has a separate direct path and no duplicate dispatcher.
        const severity=Number(record.severityNumber??0);
        if(!Number.isFinite(severity)||severity<17){rejectedLogCount++;continue;}
        const occurredAt=normalizeTime(record.timeUnixNano);
        if(!occurredAt){rejectedLogCount++;continue;}
        const props=attributesToMap(record.attributes);
        const traceparent=undefined; // no untrusted trace baggage from public native endpoint
        const stack=sanitizeMobileStack(props['exception.stacktrace']);
        const osVersion=(attributesToMap(item.resource.attributes)['os.version']??'').match(/^\d{1,3}(?:\.\d{1,3}){0,2}/)?.[0];
        const appStartId=deterministicUUID(`${scope.platform}:${props['session.id']??record.timeUnixNano}`);
        const originalKey={resource:item.resource,record,scope:collection.scope};
        const eventId=deterministicUUID(originalKey);
        const updateId=attributesToMap(item.resource.attributes)['expo.app.updates.id'] ??
          attributesToMap(item.resource.attributes)['expo.app.update_id'];
        const safeUpdateId=updateId&&UUID.test(updateId)?updateId:'embedded';
        try{
          const event=parseMobileTelemetryEvent({
            schemaVersion:1,eventId,platform:scope.platform,
            kind:classifyKind(props['event.name']),severity:severity>=21?'FATAL':'ERROR',
            occurredAt,appVersion:scope.appVersion,build:scope.build,
            runtime:scope.runtime,channel:scope.channel,updateId:safeUpdateId,appStartId,
            ...(stack?{stack}:{}),...(osVersion?{osVersion}:{}),
            ...(safeExceptionType(props)?{exceptionType:safeExceptionType(props)}:{}),
            errorCode:codeFromEventName(props['event.name']),
            ...(traceparent?{traceparent}:{}),
          });
          events.push(event);
        }catch{rejectedLogCount++;}
      }
    }
  }
  if(originalLogCount>MAX_LOG_RECORDS)throw new InvalidObservePayload('OBSERVE_BATCH_TOO_LARGE');
  return {events,scopes,originalLogCount,rejectedLogCount};
}
