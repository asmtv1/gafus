#!/usr/bin/env node
// End-to-end verification of the REAL @gafus/logger OTLP SDK -> Collector ->
// durable Tempo -> Grafana-compatible Tempo API, with cross-process parentage.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const endpoint = process.env.GAFUS_TEMPO_URL ?? "http://127.0.0.1:3200";
const collector = process.env.GAFUS_OTLP_URL ?? "http://127.0.0.1:4318/v1/traces";
const [mode, arg1, arg2, arg3] = process.argv.slice(2);
const assert = (condition, message) => { if (!condition) throw Error(message); };

async function emit() {
  const { configureServerTelemetry, startCorrelatedSpan, flushServerTelemetry, shutdownServerTelemetry } =
    await import("../../../packages/logger/dist/serverTelemetry.js");
  const service = arg1 === "api" ? "gafus-api" : "gafus-worker";
  assert(configureServerTelemetry(service), "Could not configure production OTLP SDK");
  const traceId = arg2;
  const parentSpanId = arg3;
  const span = startCorrelatedSpan({
    name: service === "gafus-api" ? "local-smoke-api" : "local-smoke-worker",
    service, traceId,
    parent: parentSpanId ? `00-${traceId}-${parentSpanId}-01` : undefined,
    kind: service === "gafus-api" ? "server" : "consumer",
    attributes: { "test.kind": "tracing-local" },
  });
  const emitted = span.spanContext();
  assert(emitted.traceId === traceId && emitted.traceFlags === 1, "Incorrect trace ID/sampling");
  span.end();
  await flushServerTelemetry();
  await shutdownServerTelemetry();
  process.stdout.write(JSON.stringify({ traceId: emitted.traceId, spanId: emitted.spanId }));
}

function child(service, traceId, parent) {
  const result = spawnSync(process.execPath, [process.argv[1], "emit", service, traceId, ...(parent ? [parent] : [])], {
    encoding: "utf8", timeout: 20000,
    env: {
      ...process.env,
      OTEL_TRACES_SAMPLER_ARG: "1",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: collector,
    },
  });
  assert(result.status === 0, `Child ${service} failed: ${result.stderr || result.error || result.stdout}`);
  return JSON.parse(result.stdout);
}

async function verify(traceId, expectedParentSpanId) {
  const deadline = Date.now() + 45000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/api/traces/${traceId}`, { signal: AbortSignal.timeout(2500) });
      const body = await response.text();
      if (response.ok) {
        const doc = JSON.parse(body);
        const spans = (doc.batches ?? doc.resourceSpans ?? []).flatMap((batch) => {
          const resource = batch.resource ?? {};
          const service = (resource.attributes ?? []).find((entry) => entry.key === "service.name")?.value?.stringValue;
          const scopeSpans = batch.scopeSpans ?? batch.instrumentationLibrarySpans ?? [];
          return scopeSpans.flatMap((scope) => (scope.spans ?? []).map((span) => ({
            service, name: span.name, traceId: span.traceId, spanId: Buffer.from(span.spanId ?? "", "base64").toString("hex"),
            parentSpanId: Buffer.from(span.parentSpanId ?? "", "base64").toString("hex"),
          })));
        });
        const api = spans.find((s) => s.service === "gafus-api" && s.name === "local-smoke-api");
        const worker = spans.find((s) => s.service === "gafus-worker" && s.name === "local-smoke-worker");
        if (api && worker) {
          assert(worker.parentSpanId === api.spanId, `Worker parent ${worker.parentSpanId} != API span ${api.spanId}`);
          if (expectedParentSpanId) assert(api.spanId === expectedParentSpanId, "API span changed after restart");
          console.log(JSON.stringify({ result: "PASS", traceId, apiSpanId: api.spanId, workerSpanId: worker.spanId,
            workerParentSpanId: worker.parentSpanId, services: ["gafus-api", "gafus-worker"] }));
          return;
        }
        last = `Missing API/Worker in Tempo payload (${spans.length} spans): ${body.slice(0, 800)}`;
      } else last = `Tempo HTTP ${response.status}: ${body.slice(0, 300)}`;
    } catch (error) { last = String(error); }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw Error(`Traces not queryable in Tempo after 45s: ${last}`);
}

try {
  if (mode === "emit") await emit();
  else if (mode === "send") {
    const traceId = randomBytes(16).toString("hex");
    const api = child("api", traceId);
    const worker = child("worker", traceId, api.spanId);
    assert(worker.traceId === traceId, "Worker did not reuse trace ID");
    console.log(`TRACE_ID=${traceId}`);
    console.log(`API_SPAN_ID=${api.spanId}`);
    await verify(traceId, api.spanId);
  } else if (mode === "verify") {
    assert(/^[a-f0-9]{32}$/.test(arg1 ?? ""), "Expected trace ID");
    await verify(arg1, arg2);
  } else throw Error("Usage: node smoke.mjs send | verify <trace-id> [expected-api-span-id]");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
