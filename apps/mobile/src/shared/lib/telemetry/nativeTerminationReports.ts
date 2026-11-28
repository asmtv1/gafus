import { parseMobileTelemetryEvent, type MobileTelemetryEventV1 } from '@gafus/types';

type Scope=Pick<MobileTelemetryEventV1,'platform'|'appVersion'|'build'|'runtime'|'channel'>;
const codes={
  ANDROID_ANR_EXIT:{platform:'android',kind:'anr',severity:'FATAL'},
  ANDROID_LOW_MEMORY_EXIT:{platform:'android',kind:'oom',severity:'FATAL'},
  IOS_MEMORY_EXIT:{platform:'ios',kind:'oom',severity:'FATAL'},
  IOS_WATCHDOG_EXIT:{platform:'ios',kind:'native_exit',severity:'FATAL'},
  IOS_HANG_DIAGNOSTIC:{platform:'ios',kind:'native_hang',severity:'ERROR'},
} as const;
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function normalizeNativeTermination(raw:unknown,scope:Scope,now=Date.now()):MobileTelemetryEventV1|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const r=raw as Record<string,unknown>;
  if(typeof r.code!=='string'||!Object.prototype.hasOwnProperty.call(codes,r.code))return;
  const code=r.code as keyof typeof codes;
  const definition=codes[code];
  if(scope.platform!==definition.platform||r.build!==scope.build||r.appVersion!==scope.appVersion||
    typeof r.id!=='string'||!uuid.test(r.id)||typeof r.timestampMs!=='number'||
    !Number.isFinite(r.timestampMs)||r.timestampMs>now||now-r.timestampMs>7*86400000-60000||
    !Number.isSafeInteger(r.count)||Number(r.count)<1||Number(r.count)>1000)return;
  return parseMobileTelemetryEvent({
    schemaVersion:1,eventId:r.id,appStartId:r.id,platform:scope.platform,
    appVersion:scope.appVersion,build:scope.build,runtime:scope.runtime,channel:scope.channel,
    // Historical OS reports lack OTA identity and the original JS session.
    updateId:'unknown',kind:definition.kind,severity:definition.severity,
    occurredAt:new Date(r.timestampMs).toISOString(),errorCode:code,stackStatus:'unavailable',
    ...(Number(r.count)>1?{occurrences:Number(r.count)}:{}),
  });
}
