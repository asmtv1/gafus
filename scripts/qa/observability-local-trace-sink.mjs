#!/usr/bin/env node
/** A2 QA: deliberately tiny loopback-only searchable OTLP/HTTP JSON sink.
 * NOT Jaeger/Tempo and NOT proof of a deployed searchable staging backend.
 * Records only bounded operational IDs/spans, never raw exporter payloads.
 */
import { createServer } from "node:http";
import { mkdir, appendFile, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
const port = Number(process.env.A2_OBS_TRACE_PORT);
const dir = process.env.A2_OBS_TRACE_DIR ?? "";
const secret = process.env.A2_OBS_KEY ?? "";
if (port !== 56248 || !/^\/tmp\/gafus-a2-obs-real-multi\.[a-zA-Z0-9]+$/.test(dir) ||
    secret.length < 32 || process.env.GAFUS_A2_OBS_ISOLATED !== "1")
  throw new Error("A2_TRACE_SINK_PRIVATE_PREFLIGHT_DENIED");
if (!(await lstat(dir)).isDirectory()) throw new Error("A2_TRACE_SINK_WRONG_DIR");
const logfile = join(dir, "otlp-sanitized-spans.jsonl");
const id = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : undefined;
const traceId = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value) ? value : undefined;
const spanId = value => typeof value === "string" && /^[a-f0-9]{16}$/.test(value) ? value : undefined;
const spanName = value => typeof value === "string" &&
  ((/^[a-z][a-z0-9_.-]{1,79}$/.test(value)) ||
   (/^(GET|POST|PUT|PATCH|DELETE|HEAD) \/[a-zA-Z0-9_/.*:-]{0,100}$/.test(value)))
  ? value : "diagnostic.invalid_span";
const attr = (attrs, name) => attrs?.find(x => x?.key === name)?.value?.stringValue;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.url === "/health") return void res.writeHead(200).end("ok");
  if (req.method === "POST" && req.url === "/v1/traces") {
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2_000_000) throw Error("PAYLOAD_TOO_LARGE");
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const safe = [];
      for (const resource of payload?.resourceSpans ?? [])
        for (const scope of resource?.scopeSpans ?? [])
          for (const span of scope?.spans ?? []) {
            const operationId = id(attr(span.attributes, "gafus.operation_id"));
            const seenTraceId = traceId(span.traceId);
            if (!operationId || !seenTraceId) continue;
            safe.push({ operationId, traceId: seenTraceId,
              name: spanName(span.name), spanId: spanId(span.spanId),
              parentSpanId: spanId(span.parentSpanId),
              attempt: Number.isInteger(Number(attr(span.attributes, "gafus.job_attempt")))
                ? Number(attr(span.attributes, "gafus.job_attempt")) : undefined });
          }
      if (safe.length) await appendFile(logfile, safe.map(x => JSON.stringify(x)).join("\n") + "\n", { mode: 0o600 });
      return void res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    } catch { return void res.writeHead(400).end(); }
  }
  if (req.method === "GET" && req.url?.startsWith("/search?")) {
    if (req.headers.authorization !== "Bearer " + secret) return void res.writeHead(404).end();
    const operationId = id(new URL(req.url, "http://127.0.0.1").searchParams.get("operationId"));
    if (!operationId) return void res.writeHead(400).end();
    const rows = (await readFile(logfile, "utf8").catch(() => "")).trim().split("\n").filter(Boolean)
      .map(line => JSON.parse(line)).filter(row => row.operationId === operationId).slice(-256);
    return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ spans: rows }));
  }
  res.writeHead(404).end();
});
server.listen(port, "127.0.0.1", () => console.log("A2_LOCAL_OTLP_SEARCHABLE_SINK_READY"));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
