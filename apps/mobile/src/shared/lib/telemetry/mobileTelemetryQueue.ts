/** JS-only mobile diagnostics queue policy. No imports from React Native.
 * Storage and transport are injected to keep retries, eviction and ACK testable. */
import { parseMobileTelemetryEvent, type MobileTelemetryEventV1 } from '@gafus/types';
export type TelemetryEntry = { event: MobileTelemetryEventV1; enqueuedAt: number; attempts: number };
export type TelemetryQueueState = { schemaVersion: 1; entries: TelemetryEntry[]; dropped: number };
export const TELEMETRY_MAX_EVENTS = 500;
export const TELEMETRY_MAX_BYTES = 8 * 1024 * 1024;
export const TELEMETRY_BATCH_EVENTS = 50;
export const TELEMETRY_BATCH_BYTES = 256 * 1024;
const DAY = 24 * 60 * 60_000;
export const emptyTelemetryQueue = (): TelemetryQueueState => ({ schemaVersion: 1, entries: [], dropped: 0 });
const fatal = (e: MobileTelemetryEventV1) => e.kind === 'js_fatal' || e.severity === 'FATAL' ||
  e.kind === 'native_crash' || e.kind === 'native_exit';
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
    if (now - entry.enqueuedAt > ttl || entry.enqueuedAt > now + DAY) { result.dropped++; continue; }
    let validated:MobileTelemetryEventV1;
    try{validated=parseMobileTelemetryEvent(entry.event);}catch{result.dropped++;continue;}
    result.entries.push({event:validated, enqueuedAt:entry.enqueuedAt,
      attempts: Number.isSafeInteger(entry.attempts) && entry.attempts >= 0 ? entry.attempts : 0});
  }
  return trimTelemetryQueue(result);
}
export function trimTelemetryQueue(state: TelemetryQueueState): TelemetryQueueState {
  const result: TelemetryQueueState = {schemaVersion:1, entries:[...state.entries], dropped:state.dropped};
  while (result.entries.length > TELEMETRY_MAX_EVENTS || size(result) > TELEMETRY_MAX_BYTES) {
    const candidate = result.entries.findIndex(e=>!fatal(e.event));
    result.entries.splice(candidate>=0?candidate:0,1); result.dropped++;
  }
  return result;
}
export function enqueueTelemetryEvent(state:TelemetryQueueState, event:MobileTelemetryEventV1,
  now:number):TelemetryQueueState {
  const normalized = normalizeTelemetryQueue(state, now);
  if (normalized.entries.some(e=>e.event.eventId===event.eventId)) return normalized;
  if (size(event)>TELEMETRY_BATCH_BYTES) return {...normalized,dropped:normalized.dropped+1};
  return trimTelemetryQueue({...normalized, entries:[...normalized.entries,{event,enqueuedAt:now,attempts:0}]});
}
export function nextTelemetryBatch(state:TelemetryQueueState): MobileTelemetryEventV1[] {
  const events:MobileTelemetryEventV1[]=[];
  let bytes=50;
  for (const entry of state.entries) {
    const eventSize = size(entry.event);
    if (eventSize > TELEMETRY_BATCH_BYTES-50) continue;
    if (events.length >= TELEMETRY_BATCH_EVENTS || bytes+eventSize > TELEMETRY_BATCH_BYTES) break;
    events.push(entry.event); bytes+=eventSize;
  }
  return events;
}
export function applyTelemetryAck(state:TelemetryQueueState, ids:unknown):TelemetryQueueState {
  if (!Array.isArray(ids) || !ids.every(id=>typeof id==='string')) return state;
  const accepted = new Set(ids as string[]);
  return {...state,entries:state.entries.filter(e=>!accepted.has(e.event.eventId))};
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
