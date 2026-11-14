import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import {
  configureServerTelemetry, startCorrelatedSpan, flushServerTelemetry,
  shutdownServerTelemetry, traceOtlpUrl, parseW3cParent, markServerSpanError,
  withServerSpan, safeSpanAttributes, recordDatabaseQueryDuration, renderDatabaseMetrics,
  recordDependencyError, renderDependencyMetrics, formatCorrelatedDiagnostic,
  recordPrismaPoolWaitHistogram, renderPrismaPoolWaitMetrics, invalidatePrismaPoolWaitHistogram,
} from "../../packages/logger/dist/serverTelemetry.js";
test("Prisma pool wait is independent of SQL, uses cumulative seconds buckets and cannot leak labels", () => {
  invalidatePrismaPoolWaitHistogram();
  assert.match(renderPrismaPoolWaitMetrics(), /db_pool_wait_metrics_fresh 0/);
  assert.equal(recordPrismaPoolWaitHistogram([{ key: "prisma_client_queries_wait_histogram_ms", labels: { owner: "secret-user" },
    value: { buckets: [[0, 0], [1, 2], [5, 1], [10, 0], [50, 0], [100, 0],
      [500, 0], [1000, 0], [5000, 0], [50000, 0]], sum: 6, count: 3 } }]), true);
  const metrics = renderPrismaPoolWaitMetrics();
  assert.match(metrics, /db_pool_wait_metrics_fresh 1/);
  assert.match(metrics, /db_pool_wait_seconds_bucket\{source="prisma_engine",le="0.001"\} 2/);
  assert.match(metrics, /db_pool_wait_seconds_bucket\{source="prisma_engine",le="0.005"\} 3/);
  assert.match(metrics, /db_pool_wait_seconds_bucket\{source="prisma_engine",le="\+Inf"\} 3/);
  assert.match(metrics, /db_pool_wait_seconds_sum\{source="prisma_engine"\} 0.006/);
  assert(!metrics.includes("secret-user"));
  assert.equal(recordPrismaPoolWaitHistogram([{ key: "prisma_client_queries_wait_histogram_ms",
    value: { buckets: [[0, 0], [1, -2]], sum: 1, count: 2 } }]), false);
  invalidatePrismaPoolWaitHistogram();
  assert.match(renderPrismaPoolWaitMetrics(), /db_pool_wait_metrics_fresh 0/);
  assert(!renderPrismaPoolWaitMetrics().includes("db_pool_wait_seconds_bucket"));
});

test("W3C context validation and fail-closed collector URL", () => {
  assert.equal(parseW3cParent("evil"), null);
  assert.equal(parseW3cParent("00-"+"0".repeat(32)+"-"+"1".repeat(16)+"-01"), null);
  assert.equal(traceOtlpUrl({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://attacker.invalid/traces" }), null);
  assert.equal(traceOtlpUrl({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://user:password@127.0.0.1:4318/traces" }), null);
  assert.equal(traceOtlpUrl({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://otel.example.org/v1/traces" }), null);
  assert.equal(traceOtlpUrl({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://api.uptrace.dev/v1/traces" }), "https://api.uptrace.dev/v1/traces");
});
test("privacy-safe attributes and Prisma query histogram do not leak SQL", () => {
  assert.deepEqual(safeSpanAttributes({
    "gafus.job_attempt": 2, "peer.service": "cloudru",
    "userId": "private-user-123", "db.statement": "SELECT * FROM accounts",
    "http.request.header.authorization": "secret",
    "gafus.stage": "x".repeat(200),
  }), { "gafus.job_attempt": 2, "peer.service": "cloudru" });
  recordDatabaseQueryDuration(4);
  recordDatabaseQueryDuration(160);
  recordDatabaseQueryDuration(-1);
  const content = renderDatabaseMetrics();
  assert(content.includes('db_query_duration_seconds_count{source="prisma_query_event"} 2'));
  assert(content.includes('db_query_duration_seconds_bucket{source="prisma_query_event",le="0.005"} 1'));
  assert(!content.includes("SELECT") && !content.includes("private-user"));
  recordDependencyError("postgresql", "query");
  recordDependencyError("postgresql", "query");
  recordDependencyError("private-user", "query"); // JS runtime must reject it
  const dependency = renderDependencyMetrics();
  assert(dependency.includes('dependency_errors_total{dependency="postgresql",class="query"} 2'));
  assert(!dependency.includes("private-user"));
  const diagnostic = formatCorrelatedDiagnostic({
    level: "error", service: "gafus-api", event: "auth/secret/user",
    traceId: "a".repeat(32), operationId: "persisted_123",
    requestId: "request-456", durationMs: 12.557, attempt: 3,
    errorCode: "Bearer sensitive-token",
    token: "private-credential", query: "SELECT * FROM user",
  });
  const parsed = JSON.parse(diagnostic);
  assert.equal(parsed.event, "diagnostic.invalid_event");
  assert.equal(parsed.errorCode, "INTERNAL_ERROR");
  assert.equal(parsed.durationMs, 12.56);
  assert.equal(parsed.operationId, "persisted_123");
  assert(!diagnostic.includes("private-credential"));
  assert(!diagnostic.includes("SELECT"));


});

test("OTLP exporter links bounded API/Worker-style parent and operation child spans", async () => {
  let resolvePayload;
  const arrived = new Promise(resolve => { resolvePayload = resolve; });
  const listener = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/traces") {
      res.writeHead(404).end(); return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    resolvePayload(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
  });
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  try {
    const address = listener.address();
    assert(address && typeof address === "object");
    process.env.OTEL_TRACES_SAMPLER_ARG = "1";
    assert.equal(configureServerTelemetry("gafus-api", {
      OTEL_TRACES_SAMPLER_ARG: "1",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:" + address.port + "/v1/traces",
    }), true);
    const traceId = "a".repeat(32);
    const span = startCorrelatedSpan({
      name: "chat2.outbox.dispatch", service: "gafus-api",
      traceId, operationId: "operation_test", kind: "consumer",
      attributes: { "gafus.job_attempt": 1 },
    });
    await withServerSpan(span, async () => {
      const child = startCorrelatedSpan({
        name: "chat2.outbox.publish", service: "gafus-api",
        kind: "client", operationId: "operation_test",
        attributes: { "gafus.retry_class": "retryable" },
      });
      child.end();
    });
    // A callback in another process/trace still belongs to the durable
    // operation; attempts have their own IDs and request correlation.
    const callback = startCorrelatedSpan({
      name: "chat2.cloud.callback", service: "gafus-api", kind: "server",
      traceId: "b".repeat(32), operationId: "operation_test",
      attributes: { "gafus.job_attempt": 2, "gafus.request_id": "callback-request",
        "db.statement": "SELECT private_data" },
    });
    callback.end();
    markServerSpanError(span, "DISPATCH_RETRY");
    span.end();
    await flushServerTelemetry();
    const result = await arrived;
    const spans = result.resourceSpans.flatMap(r => r.scopeSpans.flatMap(s => s.spans));
    assert.equal(spans.length, 3);
    const parent = spans.find(s => s.name === "chat2.outbox.dispatch");
    const child = spans.find(s => s.name === "chat2.outbox.publish");
    assert(parent && child);
    assert.notEqual(parent.traceId, traceId, "legacy trace IDs must not select a new root");
    assert.equal(child.traceId, parent.traceId, "trusted in-process child must inherit the root");
    assert.equal(child.parentSpanId, parent.spanId, "child must stay in the same trace tree");
    const callbackSpan = spans.find(s => s.name === "chat2.cloud.callback");
    assert(callbackSpan);
    assert.notEqual(callbackSpan.traceId, "b".repeat(32), "callback root must not be forged");
    assert.notEqual(callbackSpan.traceId, parent.traceId);
    const sourceTrace = s => s.attributes.find(a => a.key === "gafus.source_trace_id")?.value?.stringValue;
    assert.equal(sourceTrace(parent), traceId, "legacy correlation survives as bounded attribute");
    assert.equal(sourceTrace(callbackSpan), "b".repeat(32));
    const opId = s => s.attributes.find(a => a.key === "gafus.operation_id")?.value?.stringValue;
    assert.equal(opId(callbackSpan), opId(parent));
    assert(!JSON.stringify(result).includes("SELECT private_data"));

    assert(JSON.stringify(result).includes("operation_test"));
    assert(!JSON.stringify(result).includes("conversationId"));
    assert(!JSON.stringify(result).includes("userId"));
  } finally {
    await shutdownServerTelemetry();
    await new Promise(resolve => listener.close(resolve));
  }
});

test("collector outage never breaks the surrounded user operation", async () => {
  const sink = createServer((_, response) => response.writeHead(503).end("temporarily unavailable"));
  await new Promise(resolve => sink.listen(0, "127.0.0.1", resolve));
  const port = sink.address().port;
  try {
    process.env.OTEL_TRACES_SAMPLER_ARG = "1";
    assert.equal(configureServerTelemetry("gafus-api", {
      OTEL_TRACES_SAMPLER_ARG: "1",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:" + port + "/v1/traces",
    }), true);
    const span = startCorrelatedSpan({
      name: "audit.collector_unavailable", service: "gafus-api",
      traceId: "c".repeat(32), operationId: "preserve_operation",
    });
    const result = await withServerSpan(span, async () => ({ status: "ok" }));
    span.end();
    assert.deepEqual(result, { status: "ok" });
  } finally {
    try { await shutdownServerTelemetry(); } catch { /* exporter may reject on shutdown */ }
    await new Promise(resolve => sink.close(resolve));
  }
});
