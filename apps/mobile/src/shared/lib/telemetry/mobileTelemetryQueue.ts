/** JS-only mobile diagnostics queue policy. No imports from React Native.
 * Storage and transport are injected to keep retries, eviction and ACK testable. */
import { parseMobileTelemetryEvent, type MobileTelemetryEventV1 } from '@gafus/types';
export type TelemetryEntry = { event: MobileTelemetryEventV1; enqueuedAt: number; attempts: number; dispatched?: boolean };
export type TelemetryQueueState = { schemaVersion: 1; entries: TelemetryEntry[]; dropped: number };
export const TELEMETRY_MAX_EVENTS = 500;
export const TELEMETRY_MAX_BYTES = 8 * 1024 * 1024;
export const TELEMETRY_BATCH_EVENTS = 50;
export const TELEMETRY_BATCH_BYTES = 256 * 1024;
const DAY = 24 * 60 * 60_000;
export const emptyTelemetryQueue = (): TelemetryQueueState => ({ schemaVersion: 1, entries: [], dropped: 0 });
const fatal = (e: MobileTelemetryEventV1) => e.kind === 'js_fatal' || e.severity === 'FATAL' ||
  e.kind === 'native_crash' || e.kind === 'native_exit' || e.kind === 'native_hang' || e.kind === 'anr' || e.kind === 'oom';
const priority = (e: MobileTelemetryEventV1) => fatal(e) ? 4 : ({DEBUG:0,INFO:1,WARN:2,ERROR:3,FATAL:4})[e.severity];
const size = (value: unknown) => JSON.stringify(value).length * 2; // conservative UTF-16 upper bound
export function normalizeTelemetryQueue(raw: unknown, now: number): TelemetryQueueState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyTelemetryQueue();
  const state = raw as Partial<TelemetryQueueState>;
  if (state.schemaVersion !== 1 || !Array.isArray(state.entries)) return emptyTelemetryQueue();
  const result = emptyTelemetryQueue();
  result.dropped = Number.isSafeInteger(state.dropped) && (state.dropped ?? 0) >= 0
    ? Math.min(1_000_000, state.dropped!) : 0;
  for (const entry of state.entries.slice(-1000)) {
    if (!entry?.event || typeof entry.enqueuedAt !== 'number' || !Number.isFinite(entry.enqueuedAt)) continue;
    const ttl = fatal(entry.event) || ['ERROR', 'FATAL', 'WARN'].includes(entry.event.severity)
      ? 7 * DAY : DAY;
    if (size(entry.event)>TELEMETRY_BATCH_BYTES-50 || now - entry.enqueuedAt > ttl || entry.enqueuedAt > now + DAY) { result.dropped++; continue; }
    let validated:MobileTelemetryEventV1;
    try{validated=parseMobileTelemetryEvent(entry.event);}catch{ /* diagnostic: expected Invalid stored event is counted as dropped and isolated from valid events. */ result.dropped++;continue;}
    result.entries.push({event:validated, enqueuedAt:entry.enqueuedAt,
      attempts: Number.isSafeInteger(entry.attempts) && entry.attempts >= 0 ? entry.attempts : 0,
      // Missing flag belongs to an old queue, possibly already delivered.
      dispatched:entry.dispatched!==false});
  }
  return trimTelemetryQueue(result);
}
export function trimTelemetryQueue(state: TelemetryQueueState): TelemetryQueueState {
  const result:TelemetryQueueState={schemaVersion:1,entries:[...state.entries],dropped:Math.min(1000000,state.dropped)};
  // A single size pass plus bounded priority buckets. Avoid repeatedly
  // serializing megabytes of JSON for each eviction on a low-end device.
  let bytes=size(result),count=result.entries.length;
  if(count<=TELEMETRY_MAX_EVENTS&&bytes<=TELEMETRY_MAX_BYTES)return result;
  const ordered=result.entries.map((entry,index)=>({entry,index,priority:priority(entry.event),bytes:size(entry)+2}))
    .sort((a,b)=>a.priority-b.priority||a.index-b.index);
  const removed=new Set<number>();
  for(const item of ordered){
    if(count<=TELEMETRY_MAX_EVENTS&&bytes<=TELEMETRY_MAX_BYTES-32)break;
    removed.add(item.index);bytes-=item.bytes;count--;
  }
  result.entries=result.entries.filter((_,index)=>!removed.has(index));
  result.dropped=Math.min(1000000,result.dropped+removed.size);
  return result;
}
const aggregationKey=(event:MobileTelemetryEventV1)=>JSON.stringify([
  event.kind,event.severity,event.platform,event.appVersion,event.build,event.runtime,event.channel,event.updateId,
  event.appStartId,event.installationId,event.errorCode,event.module,event.screen,event.operation,event.routeScreen,
  event.exceptionType,event.stack,event.http?.method,event.http?.endpointGroup,event.http?.category,event.http?.status,
]);
export function enqueueTelemetryEvent(state:TelemetryQueueState, event:MobileTelemetryEventV1,
  now:number):TelemetryQueueState {
  return enqueueNormalizedTelemetryEvent(normalizeTelemetryQueue(state,now),event,now);
}
/** Internal fast path: caller already validated the queue read. */
export function enqueueNormalizedTelemetryEvent(normalized:TelemetryQueueState,event:MobileTelemetryEventV1,now:number):TelemetryQueueState {
  if (normalized.entries.some(e=>e.event.eventId===event.eventId)) return normalized;
  if (size(event)>TELEMETRY_BATCH_BYTES-50) return {...normalized,dropped:normalized.dropped+1};
  // Never mutate an event ID after it might have reached the API, including
  // ambiguous ACKs. Independent fatal failures and traced requests stay separate.
  if(!fatal(event)&&event.kind!=='session_start'&&event.kind!=='performance_summary'&&event.kind!=='telemetry_health'&&
    !event.traceparent&&!event.http?.serverTraceId&&!event.http?.clientTraceparent) {
    const key=aggregationKey(event);
    const candidate=normalized.entries.find(entry=>entry.dispatched===false&&entry.attempts===0&&
      now>=entry.enqueuedAt&&now-entry.enqueuedAt<=30_000&&
      !entry.event.traceparent&&!entry.event.http?.serverTraceId&&!entry.event.http?.clientTraceparent&&
      aggregationKey(entry.event)===key&&
      (entry.event.occurrences??1)+(event.occurrences??1)<=1000);
    if(candidate) {
      const merged={...candidate.event,occurrences:(candidate.event.occurrences??1)+(event.occurrences??1),
        lastOccurredAt:event.lastOccurredAt??event.occurredAt};
      try {
        candidate.event=parseMobileTelemetryEvent(merged);
        return trimTelemetryQueue(normalized);
      }catch{ /* diagnostic: expected Invalid merge after clock jump preserves an independent event. */ /* clocks can jump; preserve an independent event instead */}
    }
  }
  return trimTelemetryQueue({...normalized, entries:[...normalized.entries,{event,enqueuedAt:now,attempts:0,dispatched:false}]});
}
export function markTelemetryDispatched(state:TelemetryQueueState,events:MobileTelemetryEventV1[]):TelemetryQueueState {
  const ids=new Set(events.map(e=>e.eventId));
  return {...state,entries:state.entries.map(entry=>ids.has(entry.event.eventId)?{...entry,dispatched:true}:entry)};
}
export function nextTelemetryBatch(state:TelemetryQueueState, maxEvents=TELEMETRY_BATCH_EVENTS): MobileTelemetryEventV1[] {
  const events:MobileTelemetryEventV1[]=[];
  let bytes=50;
  for (const entry of [...state.entries].sort((a,b)=>priority(b.event)-priority(a.event))) {
    const eventSize = size(entry.event);
    if (eventSize > TELEMETRY_BATCH_BYTES-50) continue;
    if (events.length >= Math.max(1,Math.min(maxEvents,TELEMETRY_BATCH_EVENTS)) || bytes+eventSize > TELEMETRY_BATCH_BYTES) break;
    events.push(entry.event); bytes+=eventSize;
  }
  return events;
}
export function applyTelemetryAck(state:TelemetryQueueState, ids:unknown):TelemetryQueueState {
  if (!Array.isArray(ids) || !ids.every(id=>typeof id==='string')) return state;
  const accepted = new Set(ids as string[]);
  return {...state,entries:state.entries.filter(e=>!accepted.has(e.event.eventId))};
}
/** Only a singleton rejected by the batch endpoint with a permanent
 * format/size status is eligible. Three separate rejected attempts prevent
 * poison events from blocking otherwise deliverable reports. */
export function markTelemetryRejected(state:TelemetryQueueState,eventId:string):TelemetryQueueState {
  const entry=state.entries.find(e=>e.event.eventId===eventId);
  if(!entry)return state;
  const entries=state.entries.filter(e=>e.event.eventId!==eventId);
  if(entry.attempts>=2)return {...state,entries,dropped:state.dropped+1};
  return {...state,entries:[...entries,{...entry,attempts:entry.attempts+1}]};
}
export function telemetryRetryMs(attempt:number, seed:number, retryAfter?:string|null):number {
  let requested=0;
  if (retryAfter) {
    const secs=Number(retryAfter);
    if (Number.isFinite(secs) && secs>=0 && secs<=900) requested=Math.ceil(secs*1000);
    else {
      const diff=Date.parse(retryAfter)-Date.now();
      if (Number.isFinite(diff) && diff>=0 && diff<=900_000) requested=diff;
    }
  }
  return Math.min(900_000,Math.max(requested,Math.min(900_000,2000*Math.pow(2,Math.min(8,Math.max(0,attempt)))))+
    (Math.abs(Math.floor(seed))%900));
}

/** Grants are scoped to a verified native binary, not the current OTA update.
 * Never send an incompatible historical binary's events under a new grant. */
export function restrictTelemetryQueue(state:TelemetryQueueState,scope:Pick<MobileTelemetryEventV1,'platform'|'appVersion'|'build'|'runtime'|'channel'>) {
  const entries=state.entries.filter(({event})=>event.platform===scope.platform&&event.appVersion===scope.appVersion&&
    event.build===scope.build&&event.runtime===scope.runtime&&event.channel===scope.channel);
  const incompatible=state.entries.length-entries.length;
  return {state:{...state,entries,dropped:Math.min(1000000,state.dropped+incompatible)},incompatible};
}
