/**
 * Node-only OpenTelemetry bridge. Deliberately NOT exported from the browser-safe
 * @gafus/logger root. All spans contain bounded operation metadata, never user
 * messages, auth headers, full URLs, media object keys or raw provider errors.
 */
import { context, trace, SpanKind, SpanStatusCode, TraceFlags, type Span } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import {
  configureServerDiagnosticOtlp, enqueueServerDiagnosticOtlp,
  flushServerDiagnosticOtlp, shutdownServerDiagnosticOtlp,
  serverDiagnosticOtlpStats,
} from "./serverDiagnosticOtlp.js";
import { installServerErrorSink } from "./diagnosticSink.js";

let provider: BasicTracerProvider | undefined;
const hexTrace = /^[a-f0-9]{32}$/i;
const hexSpan = /^[a-f0-9]{16}$/i;
const TRACE_PARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i;

export function validTraceId(value: string | null | undefined): value is string {
  return !!value && hexTrace.test(value) && !/^0+$/.test(value);
}

export function parseW3cParent(header: string | undefined) {
  const parts = header?.match(TRACE_PARENT);
  if (!parts || !validTraceId(parts[1]) || !hexSpan.test(parts[2]!) || /^0+$/.test(parts[2]!)) return null;
  return { traceId: parts[1]!.toLowerCase(), spanId: parts[2]!.toLowerCase(),
    sampled: (Number.parseInt(parts[3]!, 16) & 1) !== 0 };
}
export function traceOtlpUrl(env: NodeJS.ProcessEnv): string | null {
  const raw = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    ?? (env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "") + "/v1/traces" : null);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]", "otel-collector"].includes(url.hostname);
    const cloud = url.protocol === "https:" && url.hostname === "api.uptrace.dev";
    if (!(cloud || (url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash ||
      !url.pathname.endsWith("/v1/traces")) return null;
    return url.toString();
  } catch { return null; }
}

/** Immutable, bounded resource labels for Uptrace. Never put request origin,
 * raw URL, device identifiers, user IDs or secrets in SDK resources. */
export function safeServerResourceAttributes(
  serviceName: "gafus-api" | "gafus-worker",
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const attrs: Record<string, string> = {
    "service.namespace": "gafus",
    "service.name": serviceName,
  };
  const runtime = env.GAFUS_TELEMETRY_ENVIRONMENT ||
    (env.NODE_ENV === "production" ? "production" : "development");
  if (["production", "staging", "preview", "development"].includes(runtime))
    attrs["deployment.environment.name"] = runtime;
  const releaseSha = env.GAFUS_RELEASE_SHA ?? env.GITHUB_SHA;
  if (releaseSha && /^[a-f0-9]{40}$/i.test(releaseSha)) {
    attrs["gafus.release.sha"] = releaseSha.toLowerCase();
    attrs["service.version"] = releaseSha.toLowerCase();
  }
  const version = env.GAFUS_SERVICE_VERSION;
  if (version && /^[a-zA-Z0-9_.-]{1,64}$/.test(version))
    attrs["service.version"] = version;
  return attrs;
}
export function defaultServerTraceRatio(
  serviceName: "gafus-api" | "gafus-worker",
  value?: string,
): number {
  const fallback = serviceName === "gafus-api" ? 0.05 : 0.1;
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function configureServerTelemetry(
  serviceName: "gafus-api" | "gafus-worker",
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Error logs must work even if tracing is intentionally disabled/sample=0.
  const logsEnabled=configureServerDiagnosticOtlp(serviceName, env);
  if(logsEnabled) {
    installServerErrorSink((signal) => {
      const event=signal.level==="fatal"?"logger.fatal":"logger.error";
      enqueueServerDiagnosticOtlp(formatCorrelatedDiagnostic({
        level:"error",service:serviceName,event,errorCode:signal.errorCode,
        stackFrames:signal.stackFrames,
      }));
    });
  } else {
    installServerErrorSink(null);
  }
  if (provider) return true;
  const url = traceOtlpUrl(env);
  if (!url) return false;
  const ratio = defaultServerTraceRatio(serviceName, env.OTEL_TRACES_SAMPLER_ARG);
  // Uptrace HTTP ingest requires an explicit project-scoped DSN header.
  // The header is process-only and never serialized as a span attribute.
  const dsn = env.UPTRACE_DSN;
  const headers = dsn && dsn.length >= 12 && dsn.length <= 4096 &&
    !/[\r\n]/.test(dsn) ? { 'uptrace-dsn': dsn } : undefined;
  const exporter = new OTLPTraceExporter({ url, timeoutMillis: 5_000, headers });
  const spanProcessor = new BatchSpanProcessor(exporter, {
    maxQueueSize: 2048, maxExportBatchSize: 256, scheduledDelayMillis: 5_000,
    exportTimeoutMillis: 5_000,
  });
  provider = new BasicTracerProvider({
    resource: resourceFromAttributes(safeServerResourceAttributes(serviceName, env)),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) }),
    spanProcessors: [spanProcessor],
  });
  // Context manager is required for spans across async request/use-case awaits.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(provider);
  return true;
}

// Allowlisted OTel attributes. This module is shared by API and Worker and
// must never serialize arbitrary user-supplied identifiers, SQL, URL or payloads.
const SAFE_TRACE_ATTRIBUTES = new Set([
  "http.request.method", "http.response.status_code", "gafus.request_id",
  "gafus.job_attempt", "gafus.retry_class", "gafus.cloudru.phase",
  "peer.service", "db.system", "db.operation.name", "gafus.error_code",
  "gafus.job_type", "gafus.stage",
]);
export function safeSpanAttributes(
  input: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!input) return result;
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_TRACE_ATTRIBUTES.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value) &&
      value >= 0 && value <= 1_000_000_000) result[key] = value;
    else if (typeof value === "boolean") result[key] = value;
    else if (typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,64}$/.test(value))
      result[key] = value;
  }
  return result;
}

export function startCorrelatedSpan(options: {
  name: string;
  service: "gafus-api" | "gafus-worker";
  traceId?: string | null;
  parent?: string;
  operationId?: string | null;
  kind?: "server" | "client" | "consumer" | "internal";
  attributes?: Record<string, string | number | boolean>;
}): Span {
  const remote = parseW3cParent(options.parent);
  // A public traceparent is a correlation LINK, not a server parent. Never
  // allow a client to select its sampling decision by choosing its trace ID.
  // Trusted nested operations inherit context.active() instead.
  const links = remote ? [{
    context: {
      traceId: remote.traceId, spanId: remote.spanId,
      traceFlags: TraceFlags.NONE, isRemote: true,
    },
  }] : [];
  const attrs = safeSpanAttributes(options.attributes);
  if (options.operationId && /^[a-zA-Z0-9_-]{1,64}$/.test(options.operationId))
    attrs["gafus.operation_id"] = options.operationId;
  // Old outbox records only have a trace ID; do not invent a dangling parent.
  if (validTraceId(options.traceId)) attrs["gafus.source_trace_id"] = options.traceId.toLowerCase();
  return trace.getTracer(options.service).startSpan(options.name, {
    kind: options.kind === "server" ? SpanKind.SERVER
      : options.kind === "client" ? SpanKind.CLIENT
      : options.kind === "consumer" ? SpanKind.CONSUMER : SpanKind.INTERNAL,
    attributes: attrs,
    links,
  }, context.active());
}

export async function withServerSpan<T>(span: Span, run: () => Promise<T>): Promise<T> {
  return context.with(trace.setSpan(context.active(), span), run);
}

export function markServerSpanError(span: Span, code: string): void {
  // Never record Error.message (may contain private user data/provider secrets).
  span.setStatus({ code: SpanStatusCode.ERROR, message: /^[A-Z0-9_]{1,64}$/.test(code) ? code : "INTERNAL_ERROR" });
}
// Only fixed dependency/error class values become Prometheus labels.
const DEPENDENCIES = ["postgresql", "redis", "cloudru", "cdn", "external_http"] as const;
const ERROR_CLASSES = ["query", "connection", "timeout", "provider", "other"] as const;
type Dependency = (typeof DEPENDENCIES)[number];
type DependencyClass = (typeof ERROR_CLASSES)[number];
const dependencyErrors = new Map<string, number>();
export function recordDependencyError(dependency: Dependency, errorClass: DependencyClass): void {
  // Runtime checks are also necessary for JS callers bypassing TypeScript.
  if (!DEPENDENCIES.includes(dependency) || !ERROR_CLASSES.includes(errorClass)) return;
  const key = dependency + "|" + errorClass;
  dependencyErrors.set(key, (dependencyErrors.get(key) ?? 0) + 1);
}
export function renderDependencyMetrics(): string {
  const lines = [
    "# HELP dependency_errors_total Failed dependency operations by bounded class",
    "# TYPE dependency_errors_total counter",
  ];
  for (const [key, count] of dependencyErrors) {
    const [dependency, errorClass] = key.split("|");
    lines.push('dependency_errors_total{dependency="' + dependency +
      '",class="' + errorClass + '"} ' + count);
  }
  return lines.join("\n") + "\n";
}

/**
 * Schema-constrained JSON diagnostic event. Arbitrary user/provider errors,
 * headers, chat payloads, SQL and object keys are never accepted as fields.
 * Operation IDs belong in logs/traces only, never Prometheus label sets.
 */
export function formatCorrelatedDiagnostic(input: {
  level: "debug" | "info" | "warn" | "error";
  service: "gafus-api" | "gafus-worker";
  event: string;
  requestId?: string | null;
  traceId?: string | null;
  operationId?: string | null;
  jobId?: string | null;
  eventId?: string | null;
  attempt?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
  stackFrames?: string | null;
}): string {
  const fields: Record<string, string | number> = {
    level: input.level, service: input.service,
    event: /^[a-z][a-z0-9_.-]{1,79}$/.test(input.event) ? input.event : "diagnostic.invalid_event",
  };
  for (const key of ["requestId", "operationId", "jobId", "eventId"] as const) {
    const value = input[key];
    if (value && /^[a-zA-Z0-9_-]{1,64}$/.test(value)) fields[key] = value;
  }
  if (validTraceId(input.traceId)) fields.traceId = input.traceId.toLowerCase();
  if (input.attempt !== null && input.attempt !== undefined &&
      Number.isSafeInteger(input.attempt) && input.attempt >= 0 &&
      input.attempt <= 1000) fields.attempt = input.attempt;
  if (input.durationMs !== null && input.durationMs !== undefined &&
      Number.isFinite(input.durationMs) && input.durationMs >= 0) {
    fields.durationMs = Math.round(input.durationMs * 100) / 100;
  }
  if (input.errorCode) {
    fields.errorCode = /^[A-Z0-9_]{1,64}$/.test(input.errorCode)
      ? input.errorCode : "INTERNAL_ERROR";
  }
  if(input.stackFrames&&input.stackFrames.length<=320){
    const frames=input.stackFrames.split("\n");
    if(frames.length<=4&&frames.every(x=>
      /^at [A-Za-z_$][A-Za-z0-9_.$<>-]{0,63} \(code:\d{1,6}:\d{1,5}\)$/.test(x)))
      fields.stackFrames=input.stackFrames;
  }
  return JSON.stringify(fields);
}
export function writeCorrelatedDiagnostic(
  input: Parameters<typeof formatCorrelatedDiagnostic>[0],
): void {
  const formatted = formatCorrelatedDiagnostic(input);
  process.stdout.write(formatted + "\n");
  // Only bounded warn/error diagnostics reach OTLP, never all stdout,
  // third-party stack traces, SQL, request bodies, tokens or chat content.
  if (input.level === "error" || input.level === "warn")
    enqueueServerDiagnosticOtlp(formatted);
}

// Query event duration is emitted by the Prisma engine separately from its
// pool-wait histogram below; never interpret SQL execution as connection wait.
const DB_BOUNDS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const dbHistogram = { count: 0, sum: 0, buckets: DB_BOUNDS.map(() => 0) };
export function recordDatabaseQueryDuration(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const seconds = durationMs / 1000;
  dbHistogram.count++;
  dbHistogram.sum += seconds;
  DB_BOUNDS.forEach((bound, i) => {
    if (seconds <= bound) dbHistogram.buckets[i]!++;
  });
}
/**
 * Prisma engine exposes the real time waiting for a free connection separately
 * from query execution. Its histogram buckets contain per-bin counts, not the
 * cumulative counts required by Prometheus. Never export engine labels (which
 * may grow cardinality) or infer wait time from SQL query duration.
 *
 * This optional metric exists only when the Prisma "metrics" preview feature
 * is generated; a failed scrape must expire rather than return stale data.
 */
const POOL_WAIT_ENGINE_BOUNDS_MS = [0, 1, 5, 10, 50, 100, 500, 1000, 5000, 50000] as const;
const POOL_WAIT_SAMPLE_TTL_MS = 60_000;
let poolWaitSample: { counts: number[]; count: number; sumMs: number; observedAt: number } | undefined;
export function recordPrismaPoolWaitHistogram(histograms: unknown): boolean {
  if (!Array.isArray(histograms)) return false;
  const metric = histograms.find((entry: unknown) =>
    entry !== null && typeof entry === "object" &&
    (entry as { key?: unknown }).key === "prisma_client_queries_wait_histogram_ms",
  ) as { value?: { buckets?: unknown; sum?: unknown; count?: unknown } } | undefined;
  const data = metric?.value;
  if (!data || !Array.isArray(data.buckets) ||
    data.buckets.length !== POOL_WAIT_ENGINE_BOUNDS_MS.length ||
    typeof data.sum !== "number" || !Number.isFinite(data.sum) || data.sum < 0 ||
    typeof data.count !== "number" || !Number.isSafeInteger(data.count) || data.count < 0) return false;
  const counts: number[] = [];
  let accumulated = 0;
  for (const [index, point] of data.buckets.entries()) {
    if (!Array.isArray(point) || point.length !== 2 ||
      point[0] !== POOL_WAIT_ENGINE_BOUNDS_MS[index] ||
      !Number.isSafeInteger(point[1]) || point[1] < 0) return false;
    counts.push(point[1]);
    accumulated += point[1];
  }
  if (!Number.isSafeInteger(accumulated) || accumulated > data.count) return false;
  poolWaitSample = { counts, count: data.count, sumMs: data.sum, observedAt: Date.now() };
  return true;
}
export function invalidatePrismaPoolWaitHistogram(): void { poolWaitSample = undefined; }
export function renderPrismaPoolWaitMetrics(): string {
  const fresh = poolWaitSample !== undefined && Date.now() >= poolWaitSample.observedAt &&
    Date.now() - poolWaitSample.observedAt <= POOL_WAIT_SAMPLE_TTL_MS;
  const lines = [
    "# HELP db_pool_wait_metrics_fresh Prisma engine pool-wait snapshot available within 60 seconds",
    "# TYPE db_pool_wait_metrics_fresh gauge",
    "db_pool_wait_metrics_fresh " + (fresh ? "1" : "0"),
    "# HELP db_pool_wait_seconds Time waiting for a free Prisma pool connection (not SQL execution)",
    "# TYPE db_pool_wait_seconds histogram",
  ];
  if (!fresh || !poolWaitSample) return lines.join("\n") + "\n";
  let cumulative = 0;
  for (const [index, boundMs] of POOL_WAIT_ENGINE_BOUNDS_MS.entries()) {
    cumulative += poolWaitSample.counts[index]!;
    lines.push('db_pool_wait_seconds_bucket{source="prisma_engine",le="' +
      (boundMs / 1000) + '"} ' + cumulative);
  }
  lines.push('db_pool_wait_seconds_bucket{source="prisma_engine",le="+Inf"} ' + poolWaitSample.count);
  lines.push('db_pool_wait_seconds_sum{source="prisma_engine"} ' + (poolWaitSample.sumMs / 1000));
  lines.push('db_pool_wait_seconds_count{source="prisma_engine"} ' + poolWaitSample.count);
  return lines.join("\n") + "\n";
}

export function renderDatabaseMetrics(): string {
  const label = 'source="prisma_query_event"';
  return [
    "# HELP db_query_duration_seconds Prisma engine query event duration (excluding independent pool wait measurement)",
    "# TYPE db_query_duration_seconds histogram",
    ...DB_BOUNDS.map((bound, i) =>
      'db_query_duration_seconds_bucket{' + label + ',le="' + bound + '"} ' + dbHistogram.buckets[i]),
    'db_query_duration_seconds_bucket{' + label + ',le="+Inf"} ' + dbHistogram.count,
    'db_query_duration_seconds_sum{' + label + '} ' + dbHistogram.sum,
    'db_query_duration_seconds_count{' + label + '} ' + dbHistogram.count,
  ].join("\n") + "\n" + renderPrismaPoolWaitMetrics();
}

export function renderServerDiagnosticOtlpMetrics(): string {
  const stats = serverDiagnosticOtlpStats();
  if (!stats) return "# gafus_server_diagnostic_otlp_disabled 1\n";
  return [
    "# TYPE gafus_server_diagnostic_otlp_queue gauge",
    "gafus_server_diagnostic_otlp_queue " + stats.queued,
    "# TYPE gafus_server_diagnostic_otlp_accepted_total counter",
    "gafus_server_diagnostic_otlp_accepted_total " + stats.accepted,
    "# TYPE gafus_server_diagnostic_otlp_dropped_total counter",
    "gafus_server_diagnostic_otlp_dropped_total " + stats.dropped,
    "# TYPE gafus_server_diagnostic_otlp_retries_total counter",
    "gafus_server_diagnostic_otlp_retries_total " + stats.retries,
    "# TYPE gafus_server_diagnostic_otlp_auth_suspended gauge",
    "gafus_server_diagnostic_otlp_auth_suspended " + Number(stats.authSuspended),
  ].join("\n") + "\n";
}
export async function flushServerTelemetry(): Promise<void> {
  if (provider) await provider.forceFlush();
  await flushServerDiagnosticOtlp();
}
export async function shutdownServerTelemetry(): Promise<void> {
  installServerErrorSink(null);
  if (provider) {
    await provider.shutdown();
    provider = undefined;
  }
  await shutdownServerDiagnosticOtlp();
}
