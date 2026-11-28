// ВАЖНО: загружаем .env ДО импорта queues, используя динамический импорт
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { bullTelemetryConfig, injectBullTelemetry } from "./src/telemetry-page.js";
import { boundedSnapshot, deadline, renderOperations, parseReplayRequest, replayFailedJob, countStates } from "./src/queue-operations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

// Динамически импортируем модули после загрузки env
const { createBullBoard } = await import("@bull-board/api");
const { BullMQAdapter } = await import("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = await import("@bull-board/express");
const { pushQueue, examCleanupQueue, reengagementQueue, videoTranscodingQueue,
  consentLogCleanupQueue, petPreventionReminderQueue, consultationSlaQueue,
  consultationMailQueue, consultationReminderQueue, feedProcessingQueue,
  chat2MediaProcessingQueue, connection } = await import("@gafus/queues");
const queues = [pushQueue, examCleanupQueue, reengagementQueue, videoTranscodingQueue,
  consentLogCleanupQueue, petPreventionReminderQueue, consultationSlaQueue,
  consultationMailQueue, consultationReminderQueue, feedProcessingQueue, chat2MediaProcessingQueue];
const basePath = "/api/v1/admin/queues";
const apiOrigin = process.env.NODE_ENV === "production" ? "http://gafus-api:3001" : "http://127.0.0.1:3001";
const publicOrigin = process.env.NODE_ENV === "production" ? "https://api.gafus.ru" : "http://127.0.0.1:3001";
const { createBullBoardLogger } = await import("@gafus/logger");

// Создаем логгер для bull-board
const logger = createBullBoardLogger("bull-board");

const app = express();
const bullTelemetry = bullTelemetryConfig(process.env);
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.redirect(302, publicOrigin + basePath + "/operations");
});
app.use("/admin/queues", (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).send("USE_AUTHENTICATED_QUEUE_OPERATIONS");
    return;
  }
  res.redirect(302, publicOrigin + basePath + "/operations");
});
// The gateway is not the authorization boundary: an accidental direct
// proxy of the Bull Board container must not grant access either.
app.use(basePath, async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const authorization = req.get("authorization");
  const accessCookie = req.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("gafus_access="));
  if (!authorization && !accessCookie) {
    res.status(401).send("ADMIN_SESSION_REQUIRED");
    return;
  }
  if (!["GET", "HEAD"].includes(req.method) &&
      (req.method !== "POST" || req.path !== "/operations/replay" ||
       (!authorization && req.get("origin") !== publicOrigin))) {
    res.status(403).send("QUEUE_OPERATION_FORBIDDEN");
    return;
  }
  try {
    const response = await fetch(apiOrigin + "/api/v1/admin/queues-access", {
      headers: authorization ? { authorization } : { cookie: accessCookie! },
      redirect: "error", signal: AbortSignal.timeout(3000),
    });
    if (response.status === 204) return next();
    res.status(response.status === 401 || response.status === 403 ? response.status : 503)
      .send("ADMIN_ROLE_REQUIRED_OR_UNAVAILABLE");
  } catch {
    res.status(503).send("ADMIN_ROLE_UNAVAILABLE");
  }
});
const redisReady = () => connection.status === "ready";
async function operationsPage(result?: Awaited<ReturnType<typeof replayFailedJob>>) {
  const rows = await Promise.all(queues.map(queue => boundedSnapshot(queue, redisReady)));
  return renderOperations(rows, result, basePath);
}
app.get(basePath + "/operations", async (_req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.type("html").send(await operationsPage());
});
app.post(basePath + "/operations/replay", express.urlencoded({ extended: false, limit: "2kb", parameterLimit: 5 }), async (req, res) => {
  const input = parseReplayRequest(req.body);
  if (!input) { res.status(400).send("REPLAY_CONFIRMATION_REQUIRED"); return; }
  const queue = queues.find(q => q.name === input.queue);
  if (!queue) { res.status(404).send("QUEUE_NOT_FOUND"); return; }
  const result = await replayFailedJob(queue, input, redisReady);
  // Only low-cardinality operational outcomes; never persist raw job data.
  logger.info("Queue operator replay outcome", { queue: queue.name, result });
  res.setHeader("Content-Security-Policy", "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.status(result === "QUEUED" ? 200 : result === "UNAVAILABLE" || result === "UNKNOWN_ACK" ? 503 : 409)
    .type("html").send(await operationsPage(result));
});

// Opt-in only: protected operator HTML remains unchanged without a verified
// release, and third-party Bull Board JS/EJS sources are never patched.
if (bullTelemetry) {
  app.get(basePath + "/gafus-diagnostics.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const bundle = path.join(__dirname,
      __filename.endsWith(".ts") ? "dist/gafus-diagnostics.js" : "gafus-diagnostics.js");
    res.type("application/javascript").sendFile(bundle);
  });
  app.use(basePath, (req, res, next) => {
    if (req.method !== "GET") return next();
    const upstream = res.render.bind(res);
    res.render = ((name: string, locals?: Record<string,unknown>) => {
      if (name !== "index") {
        upstream(name, locals);
        return res;
      }
      upstream(name, locals, (error, html) => {
        if (error) return next(error);
        try {
          res.type("html").send(injectBullTelemetry(html, bullTelemetry, basePath));
        } catch {
          // A third-party UI update must never serve an unreviewed injected
          // page. Fail closed rather than corrupt operator credentials.
          res.status(503).type("text/plain").send("BULL_UI_TELEMETRY_TEMPLATE_INCOMPATIBLE");
        }
      });
      return res;
    }) as typeof res.render;
    next();
  });
}
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(basePath);

logger.info("Bull-Board initializing", {
  environment: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3002,
  basePath,
});

// Добавляем обработку ошибок
try {
  createBullBoard({
    // Disable generic retry, promote, clean, pause and delete actions.
    // External-effect jobs require domain reconciliation, not blanket replay.
    queues: queues.map(queue => new BullMQAdapter(queue, { readOnlyMode: true })),
    serverAdapter,
  });

  logger.success("Bull Board created successfully", {
    queueCount: queues.length,
    queueNames: queues.map(queue => queue.name),
    basePath,
    operation: "create_bull_board",
  });

  app.use(basePath, serverAdapter.getRouter());
} catch (error) {
  logger.error("Ошибка при создании Bull Board", error as Error, {
    environment: process.env.NODE_ENV || "development",
    port: process.env.PORT || 3002,
    operation: "create_bull_board",
  });
  // Создаем fallback роут
  app.use(basePath, (req, res) => {
    res.status(500).json({
      error: "Bull Board недоступен",
      message: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  });
}

// Добавляем health check endpoint
app.get("/health", (req, res) => {
  // Не логируем health checks - они вызываются Prometheus каждые 15 секунд
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Scrapes must not launch an unlimited number of pending Redis commands.
type Counts = { counts: Record<string, number>; paused: boolean };
const metricReads = new Map<string, Promise<Counts>>();
async function exportQueueMetrics(queue: typeof queues[number]): Promise<string> {
  const name = queue.name;
  const unavailable = () => `bullmq_queue_metrics_available{queue="${name}"} 0`;
  if (!redisReady()) return unavailable();
  let read = metricReads.get(name);
  if (!read) {
    read = Promise.all([queue.getJobCounts(...countStates), queue.isPaused()])
      .then(([counts, paused]) => ({ counts, paused })).finally(() => metricReads.delete(name));
    metricReads.set(name, read);
  }
  try {
    const { counts, paused } = await deadline(read, 3000);
    if (countStates.some(state => !Number.isSafeInteger(counts[state]) || counts[state] < 0)) return unavailable();
    const states = { waiting: counts.wait, active: counts.active, completed: counts.completed,
      failed: counts.failed, delayed: counts.delayed, paused: paused ? 1 : 0,
      prioritized: counts.prioritized, "waiting-children": counts["waiting-children"], "paused-jobs": counts.paused };
    return [
      `bullmq_queue_metrics_available{queue="${name}"} 1`,
      ...Object.entries(states).map(([state, count]) => `bullmq_job_count{queue="${name}",state="${state}"} ${count}`),
      `bullmq_queue_total{queue="${name}"} ${Object.entries(counts).filter(([state]) => state !== "completed").reduce((sum, [,count]) => sum + count, 0)}`,
    ].join("\n");
  } catch { return unavailable(); }
}
app.get("/metrics", async (_req, res) => {
  const rows = await Promise.all(queues.map(exportQueueMetrics));
  res.type("text/plain; version=0.0.4").send([
    "# HELP bullmq_queue_metrics_available Redis queue metrics are available (1) or unknown (0)",
    "# TYPE bullmq_queue_metrics_available gauge",
    "# HELP bullmq_job_count Number of jobs in queue by state",
    "# TYPE bullmq_job_count gauge",
    "# HELP bullmq_queue_total Non-completed jobs in queue",
    "# TYPE bullmq_queue_total gauge",
    ...rows,
  ].join("\n") + "\n");
});

// Берём порт из env, если нет — ставим 3002
const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  logger.success(`Bull-Board запущен: http://localhost:${PORT}${basePath}`, {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    basePath,
    operation: "start_server",
  });
});

// Graceful shutdown
process.once("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

process.once("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});
