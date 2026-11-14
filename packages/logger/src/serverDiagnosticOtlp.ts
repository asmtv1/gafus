/**
 * Server-only, opt-in OpenTelemetry Logs exporter for GAFUS's schema-bound
 * structured diagnostics. This is intentionally NOT a general-purpose logger:
 * arbitrary Error.message, SQL, URL, headers, user fields and stack are refused.
 *
 * A small, bounded in-process queue is best effort. Mobile's separate durable
 * PostgreSQL spool remains the loss-resistant path for native crash reports.
 */
type Service = "gafus-api" | "gafus-worker";
type Level = "warn" | "error";
type Diagnostic = {
  level: Level;
  service: Service;
  event: string;
  errorCode?: string;
  stackFrames?: string;
  traceId?: string;
  requestId?: string;
  operationId?: string;
  jobId?: string;
  eventId?: string;
  attempt?: number;
  durationMs?: number;
};
type TransportState = {
  queued: number; accepted: number; dropped: number; retries: number;
  authSuspended: boolean;
};
const MAX_QUEUE = 512;
const MAX_BATCH = 24;
const MAX_RESPONSE = 4096;
const SAFE_EVENT = /^[a-z][a-z0-9_.-]{1,79}$/;
const SAFE_CODE = /^[A-Z0-9_]{1,64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TRACE_ID = /^[0-9a-f]{32}$/i;
const ALLOWED_SERVICES = new Set<Service>(["gafus-api", "gafus-worker"]);
const attr = (key: string, value: string | number) => ({
  key, value: typeof value === "number"
    ? { doubleValue: value } : { stringValue: value },
});

/** Private, dependency-free transport whose network boundary is mockable. */
export class ServerDiagnosticOtlp {
  private readonly queue: Diagnostic[] = [];
  private readonly fetchFn: typeof fetch;
  private pending: Promise<void> | undefined;
  private accepted = 0;
  private dropped = 0;
  private retries = 0;
  private suspended = false;
  constructor(
    readonly service: Service,
    readonly endpoint: string,
    private readonly dsn: string,
    fetchFn: typeof fetch = fetch,
    readonly environment: "preview" | "production" = "preview",
  ) {
    if (!ALLOWED_SERVICES.has(service) ||
      endpoint !== "https://api.uptrace.dev/v1/logs" &&
      endpoint !== "http://otel-collector:4318/v1/logs" &&
      endpoint !== "http://localhost:4318/v1/logs" &&
      endpoint !== "http://127.0.0.1:4318/v1/logs" ||
      !dsn || dsn.length < 12 || dsn.length > 4096 || /[\r\n\x00-\x1f]/.test(dsn))
      throw new Error("GAFUS_DIAGNOSTIC_OTLP_INVALID_CONFIGURATION");
    this.fetchFn = fetchFn;
  }
  enqueue(formatted: string): boolean {
    // Parse only after the schema-constraining formatter has run. Revalidate
    // all properties to protect this public server-only entrypoint from misuse.
    if (typeof formatted !== "string" || formatted.length > 1024) return false;
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(formatted) as Record<string, unknown>; }
    catch { return false; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      Object.keys(raw).some(key => ![
        "level", "service", "event", "errorCode", "traceId", "requestId",
        "operationId", "jobId", "eventId", "attempt", "durationMs", "stackFrames",
      ].includes(key)) ||
      (raw.level !== "warn" && raw.level !== "error") ||
      raw.service !== this.service ||
      typeof raw.event !== "string" || !SAFE_EVENT.test(raw.event) ||
      (raw.errorCode !== undefined &&
        (typeof raw.errorCode !== "string" || !SAFE_CODE.test(raw.errorCode))) ||
      (raw.traceId !== undefined &&
        (typeof raw.traceId !== "string" || !TRACE_ID.test(raw.traceId) ||
          /^0+$/.test(raw.traceId)))) return false;
    if(raw.stackFrames!==undefined){
      if(typeof raw.stackFrames!=="string"||raw.stackFrames.length>320)return false;
      const frames=raw.stackFrames.split("\n");
      if(frames.length>4||!frames.every(line=>
        /^at [A-Za-z_$][A-Za-z0-9_.$<>-]{0,63} \(code:\d{1,6}:\d{1,5}\)$/.test(line)))
        return false;
    }
    for (const key of ["requestId", "operationId", "jobId", "eventId"] as const) {
      if (raw[key] !== undefined && (typeof raw[key] !== "string" ||
        !SAFE_ID.test(raw[key]))) return false;
    }
    for (const key of ["attempt", "durationMs"] as const) {
      if (raw[key] !== undefined && (typeof raw[key] !== "number" ||
        !Number.isFinite(raw[key]) || raw[key] < 0 || raw[key] > 1e9))
        return false;
    }
    if (this.queue.length >= MAX_QUEUE) {
      this.dropped++;
      return false;
    }
    this.queue.push(raw as Diagnostic);
    return true;
  }
  stats(): TransportState {
    return { queued:this.queue.length, accepted:this.accepted,
      dropped:this.dropped, retries:this.retries, authSuspended:this.suspended };
  }
  async flush(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.queue.length || this.suspended) return;
    this.pending = this.flushInternal();
    try { await this.pending; }
    finally { this.pending = undefined; }
  }
  private async flushInternal(): Promise<void> {
    // No fetch retries in one flush: stable memory budget and bounded latency.
    const batch = this.queue.slice(0, MAX_BATCH);
    const timeUnixNano = (BigInt(Date.now()) * 1_000_000n).toString();
    const body = JSON.stringify({resourceLogs:[{
      resource:{attributes:[
        attr("service.name",this.service),
        attr("service.namespace","gafus"),
        attr("deployment.environment.name",this.environment),
      ]},scopeLogs:[{scope:{name:"gafus.server-diagnostic",version:"1"},
        logRecords:batch.map(e => {
          const attributes = [attr("gafus.diagnostic.event",e.event)];
          if (e.errorCode) attributes.push(attr("gafus.error_code",e.errorCode));
          if (e.stackFrames) attributes.push(attr("gafus.safe_stack_frames",e.stackFrames));
          for (const key of ["requestId","operationId","jobId","eventId"] as const) {
            if (e[key]) attributes.push(attr("gafus."+key.replace(/[A-Z]/g,m=>"_"+m.toLowerCase()),e[key]));
          }
          if (e.attempt !== undefined) attributes.push(attr("gafus.attempt",e.attempt));
          if (e.durationMs !== undefined) attributes.push(attr("gafus.duration_ms",e.durationMs));
          return {
            timeUnixNano, severityNumber:e.level === "error" ? 17 : 13,
            severityText:e.level.toUpperCase(), body:{stringValue:e.event},
            attributes,
            ...(e.traceId ? {traceId:e.traceId} : {}),
          };
        })}]}]});
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint,{
        method:"POST",headers:{"content-type":"application/json","uptrace-dsn":this.dsn},
        redirect:"error",signal:AbortSignal.timeout(5000),body,
      });
    } catch {
      this.retries++;
      return;
    }
    if (response.status === 401 || response.status === 403) {
      this.suspended = true;
      return;
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429 || response.status === 408) {
        this.retries++;
      } else {
        this.queue.splice(0,batch.length);
        this.dropped += batch.length;
      }
      return;
    }
    // An opaque 2xx / malformed body is NOT a confirmed OTLP ACK.
    if (response.status !== 204) {
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        this.retries++;
        return;
      }
      let ack: unknown;
      try {
        const raw = await response.text();
        if (raw.length > MAX_RESPONSE) { this.retries++; return; }
        ack = raw.trim() ? JSON.parse(raw) : {};
      } catch { this.retries++; return; }
      if (!ack || typeof ack !== "object" || Array.isArray(ack)) {
        this.retries++;
        return;
      }
      const partial = (ack as Record<string,unknown>).partialSuccess;
      if (partial !== undefined) {
        const rejected = (partial as {rejectedLogRecords?:unknown} | null)?.rejectedLogRecords;
        if (!Number.isSafeInteger(rejected) || !(typeof rejected === "number") ||
          rejected < 0 || rejected > batch.length) {
          this.retries++;
          return;
        }
        if (rejected > 0) {
          // A batch-level partial ACK cannot identify rejected entries.
          // Do not repeatedly retransmit the already accepted subset.
          this.queue.splice(0,batch.length);
          this.accepted += Math.max(0,batch.length - Math.min(rejected,batch.length));
          this.dropped += Math.min(rejected,batch.length);
          return;
        }
      }
    }
    this.queue.splice(0,batch.length);
    this.accepted += batch.length;
  }
}

let active: ServerDiagnosticOtlp | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;

/** Explicit per-environment opt in. Production requires separate approval. */
export function configureServerDiagnosticOtlp(
  service: Service,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (active) return active.service === service;
  const environment = env.GAFUS_TELEMETRY_ENVIRONMENT;
  if (env.GAFUS_UPTRACE_LOGS_ENABLED !== "true" ||
    (environment !== "preview" && environment !== "production") ||
    (environment === "production" &&
      env.GAFUS_TELEMETRY_PRODUCTION_APPROVED !== "true")) return false;
  try {
    const dsn = env.UPTRACE_DSN;
    if (!dsn) return false;
    active = new ServerDiagnosticOtlp(service,
      env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? "",dsn,fetch,environment);
    ticker = setInterval(() => { void active?.flush(); }, 5000);
    ticker.unref?.();
    return true;
  } catch { return false; }
}
export function enqueueServerDiagnosticOtlp(formatted: string): void {
  active?.enqueue(formatted);
}
export function serverDiagnosticOtlpStats(): TransportState | null {
  return active?.stats() ?? null;
}
export async function flushServerDiagnosticOtlp(): Promise<void> {
  await active?.flush();
}
export async function shutdownServerDiagnosticOtlp(): Promise<void> {
  if (ticker) clearInterval(ticker);
  ticker = undefined;
  const exporter=active;
  if (!exporter) return;
  // Bounded drain; don't strand all but 24 events on a normal restart.
  // Stop immediately on any retry/auth issue to avoid a tight-loop outage.
  const deadline=Date.now()+3500;
  try {
    for(let i=0;i<24 && Date.now()<deadline;i++){
      const before=exporter.stats();
      if(!before.queued || before.authSuspended) break;
      await exporter.flush();
      const after=exporter.stats();
      if(after.queued>=before.queued)break;
    }
  }finally{active=undefined;}
}
