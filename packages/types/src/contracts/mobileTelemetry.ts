/** Browser-safe v1 diagnostics contract. Never accept arbitrary error contexts or
 * payload fields. API reparses untrusted requests before durable storage. */
export type TelemetryPlatform = 'ios' | 'android' | 'web';
export type TelemetryKind = 'js_handled' | 'js_fatal' | 'react_error' |
  'promise_rejection' | 'native_crash' | 'native_exit' | 'anr' | 'oom' |
  'network_failure' | 'startup_failure';
export type TelemetrySeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
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
  osVersion?: string;
  exceptionType?: string;
  errorCode?: string;
  operation?: string;
  stack?: string;
  traceparent?: string;
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
  'native_crash', 'native_exit', 'anr', 'oom', 'network_failure', 'startup_failure',
]);
const SEVERITIES = new Set<TelemetrySeverity>(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);
const PLATFORMS = new Set<TelemetryPlatform>(['ios', 'android', 'web']);
const KEYS = new Set([
  'schemaVersion', 'eventId', 'platform', 'kind', 'severity', 'occurredAt',
  'appVersion', 'build', 'runtime', 'channel', 'updateId', 'appStartId',
  'osVersion', 'exceptionType', 'errorCode', 'operation', 'stack', 'traceparent',
]);
const fnName = (input: string) => {
  const normalized = input.replace(/[^A-Za-z\d_.$<>/-]/g, '_').slice(0, 100);
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
    // JS: at f (https://private/.../bundle.js:123:45) or at f (index:123:45)
    const v8 = /^at\s+([^\s(]+)(?:\s+\([^)]*\))?/.exec(line);
    const jsPosition = /:(\d{1,8}):(\d{1,7})\)?\s*$/.exec(line);
    if (v8 && jsPosition) {
      frames.push(`at ${fnName(v8[1]!)} (bundle:${Number(jsPosition[1])}:${Number(jsPosition[2])})`);
      continue;
    }
    // Hermes: f@https://private/.../bundle.js:123:45
    const hermes = /^([^@\s]+)@.*:(\d{1,8}):(\d{1,7})\s*$/.exec(line);
    if (hermes) {
      frames.push(`at ${fnName(hermes[1]!)} (bundle:${Number(hermes[2])}:${Number(hermes[3])})`);
      continue;
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

export function parseMobileTelemetryEvent(value: unknown): MobileTelemetryEventV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('TELEMETRY_EVENT_NOT_OBJECT');
  const e = value as Record<string, unknown>;
  if (Object.keys(e).some(k => !KEYS.has(k))) throw new Error('TELEMETRY_UNKNOWN_FIELD');
  if (e.schemaVersion !== 1) throw new Error('TELEMETRY_SCHEMA_VERSION');
  const eventId = readSafeText(e, 'eventId', 36, UUID);
  const appStartId = readSafeText(e, 'appStartId', 36, UUID);
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
  const updateId = readSafeText(e, 'updateId', 40, /^(?:embedded|[a-f\d-]{36})$/i);
  if (updateId !== 'embedded' && !UUID.test(updateId)) throw new Error('TELEMETRY_UPDATE_ID');
  const osVersion = readOptional(e, 'osVersion', 20, /^\d{1,3}(?:\.\d{1,3}){0,2}$/);
  const exceptionType = readOptional(e, 'exceptionType', 100, /^[a-zA-Z_$][a-zA-Z\d_.$<>-]{0,99}$/);
  const errorCode = readOptional(e, 'errorCode', 64, CODE);
  const operation = readOptional(e, 'operation', 64, CODE);
  const stack = sanitizeMobileStack(e.stack);
  if (typeof e.stack === 'string' && e.stack.length > 16_384) throw new Error('TELEMETRY_STACK_TOO_LARGE');
  const traceparent = parseMobileTraceparent(e.traceparent);
  return {
    schemaVersion: 1, eventId, platform: platform as TelemetryPlatform,
    kind: kind as TelemetryKind, severity: severity as TelemetrySeverity,
    occurredAt, appVersion, build, runtime, channel, updateId, appStartId,
    ...(osVersion ? {osVersion} : {}),
    ...(exceptionType ? {exceptionType} : {}),
    ...(errorCode ? {errorCode} : {}),
    ...(operation ? {operation} : {}),
    ...(stack ? {stack} : {}),
    ...(traceparent ? {traceparent} : {}),
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
