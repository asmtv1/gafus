import { firstFrameMetrics } from "./video-first-frame-metrics.js";
import { renderDatabaseMetrics, renderDependencyMetrics, renderServerDiagnosticOtlpMetrics, writeCorrelatedDiagnostic, recordPrismaPoolWaitHistogram, invalidatePrismaPoolWaitHistogram } from "@gafus/logger/server-telemetry";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { clientTraceAttributes } from "./client-trace-context.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";
import {
  configureServerTelemetry,
  startCorrelatedSpan,
  withServerSpan,
  markServerSpanError,
  validTraceId,
} from "@gafus/logger/server-telemetry";

configureServerTelemetry("gafus-api");

/** Zero-PII request correlation. IDs are never used as Prometheus labels. */
type RequestCorrelation = { requestId: string; traceId: string; operationId: string };
const traceContext = new AsyncLocalStorage<RequestCorrelation>();
/** Per-request identifier for structured diagnostic logs; never a metric label. */
export function getRequestCorrelation(): RequestCorrelation | Record<string, never> {
  return traceContext.getStore() ?? {};
}
/** Outbox retains the stable operation/trace IDs without writing request-local metadata to the DB. */
export function getOutboxCorrelation():
  | { traceId: string; operationId: string }
  | Record<string, never> {
  const current = traceContext.getStore();
  return current ? { traceId: current.traceId, operationId: current.operationId } : {};
}
const bounds = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const MAX_ROUTES = 250;
type Counter = { count: number; sum: number; buckets: number[] };
const counters = new Map<string, Counter>();
let inFlight = 0;
const label = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
const knownRoute = (route: string | undefined): string =>
  route &&
  route.length <= 120 &&
  /^\/[a-zA-Z0-9_/:.*-]*$/.test(route) &&
  !/\/[a-f0-9]{24,}/i.test(route)
    ? route
    : "unmatched";

/** Only an already-authorized metrics scrape samples the actual Prisma pool.
 * The monitor does not execute SQL and never exports raw Prisma engine labels.
 * A timeout yields an unavailable gauge, not an infinite scrape or stale values.
 */
async function refreshPoolWaitMetrics(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const histograms = await Promise.race([
      import("@gafus/statistics/database-health").then(
        ({ readDatabasePoolWaitHistograms }) => readDatabasePoolWaitHistograms(),
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("POOL_METRICS_TIMEOUT")), 400);
        timer.unref?.();
      }),
    ]);
    if (!recordPrismaPoolWaitHistogram(histograms)) invalidatePrismaPoolWaitHistogram();
  } catch {
    invalidatePrismaPoolWaitHistogram();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A single per-process API metrics register. No user IDs, URL params, or payloads. */
export const operationMetricsMiddleware: MiddlewareHandler = async (c, next) => {
  const traceParent = c.req.header("traceparent");
  // These are created by the server, not trusted from client headers or payload.
  const requestId = randomUUID();
  const operationId = randomUUID();
  const start = performance.now();
  const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(c.req.method) ? c.req.method : "OTHER";
  const span = startCorrelatedSpan({
    name: method + " " + knownRoute(c.req.routePath),
    service: "gafus-api",
    kind: "server",
    operationId,
    parent: traceParent,
    attributes: { "http.request.method": method, "gafus.request_id": requestId,
      ...clientTraceAttributes(name => c.req.header(name)) },
  });
  const sdkTraceId = span.spanContext().traceId;
  // NoopTracer has all-zero trace IDs when OTLP is intentionally disabled.
  const traceId = validTraceId(sdkTraceId) ? sdkTraceId : randomUUID().replace(/-/g, "");
  c.set("traceId", traceId);
  c.set("requestId", requestId);
  c.set("operationId", operationId);
  c.header("X-Trace-Id", traceId);
  c.header("X-Request-Id", requestId);
  // Durable business ID: the same value is persisted with Chat2 outbox events.
  c.header("X-Operation-Id", operationId);
  inFlight++;
  try {
    await withServerSpan(span, () => traceContext.run(
      { traceId, requestId, operationId },
      async () => {
        if (method === "GET" && c.req.path === "/internal/metrics" &&
          authorizedOperationMetrics(c.req.header("Authorization"), process.env.API_METRICS_KEY)) {
          await refreshPoolWaitMetrics();
        }
        await next();
      },
    ));
  } catch (error) {
    markServerSpanError(span, "REQUEST_FAILED");
    writeCorrelatedDiagnostic({
      level: "error", service: "gafus-api", event: "http.request_failed",
      traceId, requestId, operationId, durationMs: performance.now() - start,
      errorCode: "REQUEST_FAILED",
    });
    throw error;
  } finally {
    span.updateName?.(method + " " + knownRoute(c.req.routePath));
    span.setAttribute("http.response.status_code", c.res.status);
    if (c.res.status >= 500) markServerSpanError(span, "HTTP_5XX");
    span.end();
    inFlight--;
    const route = knownRoute(c.req.routePath);
    const status = String(Math.floor(c.res.status / 100)) + "xx";
    const key = method + "|" + route + "|" + status;
    if (counters.has(key) || counters.size < MAX_ROUTES) {
      const counter = counters.get(key) ?? { count: 0, sum: 0, buckets: bounds.map(() => 0) };
      const duration = Math.max(0, (performance.now() - start) / 1000);
      counter.count++;
      counter.sum += duration;
      bounds.forEach((limit, index) => {
        if (duration <= limit) counter.buckets[index]!++;
      });
      counters.set(key, counter);
    }
  }
};

/** Correlated use-case stage; callers supply ONLY constant low-cardinality names.
 * Propagates the request's operation ID through OpenTelemetry without raw user
 * data, provider errors, account identifiers or database statements.
 */
export async function withCorrelatedUseCase<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(name)) {
    throw new Error("INVALID_OPERATION_STAGE");
  }
  const span = startCorrelatedSpan({
    service: "gafus-api",
    name,
    kind: "internal",
    operationId: traceContext.getStore()?.operationId,
  });
  try {
    return await withServerSpan(span, action);
  } catch (error) {
    markServerSpanError(span, "USE_CASE_FAILED");
    const current = traceContext.getStore();
    writeCorrelatedDiagnostic({
      level: "error", service: "gafus-api", event: "application.use_case_failed",
      traceId: current?.traceId, requestId: current?.requestId,
      operationId: current?.operationId, errorCode: "USE_CASE_FAILED",
    });
    throw error;
  } finally {
    span.end();
  }
}

export function renderOperationMetrics(): string {
  const lines = [
    "# HELP http_requests_total Number of HTTP requests by matched route and status family",
    "# TYPE http_requests_total counter",
    "# HELP http_request_duration_seconds Matched-route HTTP latency",
    "# TYPE http_request_duration_seconds histogram",
    "# HELP http_inflight_requests Number of API requests currently running",
    "# TYPE http_inflight_requests gauge",
    "http_inflight_requests " + inFlight,
  ];
  for (const [key, data] of counters) {
    const [method, route, status] = key.split("|");
    const base =
      'method="' +
      label(method!) +
      '",route="' +
      label(route!) +
      '",status="' +
      label(status!) +
      '"';
    lines.push("http_requests_total{" + base + "} " + data.count);
    bounds.forEach((upper, idx) =>
      lines.push(
        "http_request_duration_seconds_bucket{" +
          base +
          ',le="' +
          upper +
          '"} ' +
          data.buckets[idx],
      ),
    );
    lines.push("http_request_duration_seconds_bucket{" + base + ',le="+Inf"} ' + data.count);
    lines.push("http_request_duration_seconds_sum{" + base + "} " + data.sum);
    lines.push("http_request_duration_seconds_count{" + base + "} " + data.count);
  }
  return lines.join("\n") + "\n" + renderDatabaseMetrics() + renderDependencyMetrics() + renderServerDiagnosticOtlpMetrics() + firstFrameMetrics.render();
}
export function authorizedOperationMetrics(
  authorization: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice(7));
  const key = Buffer.from(expected);
  return actual.length === key.length && timingSafeEqual(actual, key);
}
