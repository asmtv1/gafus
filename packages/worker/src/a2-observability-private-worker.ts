/** A2 QA: two actual Chat2 dispatch loops; private telemetry on localhost. */
import { createServer } from "node:http";
import { renderDatabaseMetrics } from "@gafus/logger/server-telemetry";
import { disconnectCoreDatabase } from "@gafus/statistics/database-health";
import { chat2PollIsFresh, probeChat2BrokerAuth } from "./chat2-readiness";
import { startChat2OutboxWorker, chat2OutboxMetricsSnapshot } from "./chat2-outbox-worker";
import { chat2OutboxExecutionMetrics } from "./chat2-outbox-metrics";

const port = Number(process.env.A2_OBS_WORKER_PORT);
const db = new URL(process.env.DATABASE_URL ?? "http://invalid");
const redis = new URL(process.env.REDIS_URL ?? "http://invalid");
if (process.env.GAFUS_A2_OBS_ISOLATED !== "1" ||
    ![56246, 56247].includes(port) ||
    process.env.NODE_ENV !== "development" ||
    process.env.CHAT2_WORKER_ENABLED !== "enabled" ||
    db.protocol !== "postgresql:" || db.hostname !== "127.0.0.1" ||
    db.port !== "56241" || db.pathname !== "/gafus_a2_observability" ||
    redis.protocol !== "redis:" || redis.hostname !== "127.0.0.1" ||
    redis.port !== "56242" ||
    !process.env.API_METRICS_KEY || process.env.API_METRICS_KEY.length < 32 ||
    process.env.CLOUDRU_MEDIA_JOBS_ENABLED !== "false") {
  throw new Error("A2_PRIVATE_WORKER_PREFLIGHT_DENIED");
}
const stop = startChat2OutboxWorker();
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.url === "/ready") {
    const healthy = chat2PollIsFresh();
    res.writeHead(healthy ? 200 : 503).end(healthy ? "ready" : "not ready");
    return;
  }
  const auth = req.headers.authorization;
  const expected = "Bearer " + process.env.API_METRICS_KEY;
  if (req.url === "/__a2_readiness_diagnostic" && auth === expected) {
    const [broker, database] = await Promise.all([
      probeChat2BrokerAuth(),
      chat2OutboxMetricsSnapshot().then(() => ({ ok: true }), (error: unknown) => {
        const candidate = error as { code?: unknown; errorCode?: unknown };
        const code = candidate?.code ?? candidate?.errorCode;
        return { ok: false, code: typeof code === "string" && /^P[0-9]{4}$/.test(code) ? code : "UNKNOWN" };
      }),
    ]);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      freshPoll: chat2PollIsFresh(), broker, database,
    }));
    return;
  }
  if (req.url !== "/metrics" || auth !== expected) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = (await chat2OutboxMetricsSnapshot()) +
      chat2OutboxExecutionMetrics.render() + renderDatabaseMetrics();
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" }).end(body);
  } catch {
    res.writeHead(503).end("unavailable");
  }
});
server.listen(port, "127.0.0.1", () => console.log("A2_PRIVATE_REAL_CHAT2_WORKER_LISTENING", port));
const close = () => { stop(); server.close(); void disconnectCoreDatabase(); };
process.on("SIGTERM", close);
process.on("SIGINT", close);
