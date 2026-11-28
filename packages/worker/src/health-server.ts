import { readOtaOperationalTelemetry } from "@gafus/mobile-ota-server/telemetry";
import { renderOtaOperationalMetrics } from "./ota-operational-metrics";
import { readWalkGpsOperationalMetrics } from "@gafus/tracking-server/walks";
import { renderWalkGpsMetrics } from "./walk-gps-metrics";
import { readMediaCdnPurgeMetrics } from "@gafus/media-server/purge-repository";
import { renderMediaCdnPurgeMetrics } from "./media-cdn-purge-metrics";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { createWorkerLogger } from "@gafus/logger";
import { flushServerTelemetry, renderServerDiagnosticOtlpMetrics } from "@gafus/logger/server-telemetry";
import { renderAppSubscriptionMetricsPrometheus } from "./app-subscription-metrics";
import { renderMailDeliveryMetricsPrometheus } from "./mail-delivery-monitor";
import { renderMediaProcessingMetricsPrometheus } from "./media-processing-metrics";
import { chat2OutboxMetricsSnapshot } from "./chat2-outbox-worker";
import { chat2OutboxExecutionMetrics } from "./chat2-outbox-metrics";
import { renderQuestionsLegacyDeletionMetricsPrometheus } from "@gafus/questions-server/photos";
import { chat2PollIsFresh, hasChat2ReadinessKey } from "./chat2-readiness";
import { renderMobileTelemetryMetricsPrometheus } from "./mobile-telemetry-spool-worker";

const HEALTH_BODY = '{"ok":true}';

/**
 * Лёгкий HTTP-сервер для /health (liveness).
 * Использует только node:http, без внешних зависимостей.
 */
export function startHealthServer(beforeShutdown: () => Promise<void> = async () => {}): Server {
  const port = parseInt(process.env.WORKER_HEALTH_PORT ?? "3003", 10);
  const log = createWorkerLogger("health-server");

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? "";
    const path = (req.url ?? "").split("?")[0];

    // Only reachable within the private worker network and requires a shared
    // server-only broker key. Never publish a readiness result for a guest.
    if (path === "/internal/chat2/ready") {
      const authenticated =
        method === "GET" && hasChat2ReadinessKey(req.headers["x-chat2-readiness-key"]);
      const ready = authenticated && chat2PollIsFresh();
      res.writeHead(!authenticated ? 404 : ready ? 200 : 503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(ready ? '{"ready":true}' : '{"ready":false}');
      return;
    }
    if ((method === "GET" || method === "HEAD") && path === "/health") {
      res.writeHead(200, {
        "Content-Type": "application/json",
      });
      if (method === "GET") {
        res.end(HEALTH_BODY);
      } else {
        res.end();
      }
      return;
    }

    // Independent media metrics, so slow subscription reporting cannot mask
    // orphaned processing leases. Results never include account/media keys.
    if ((method === "GET" || method === "HEAD") && path === "/metrics/media") {
      Promise.all([
        renderMediaProcessingMetricsPrometheus(),
        chat2OutboxMetricsSnapshot(),
        renderQuestionsLegacyDeletionMetricsPrometheus(),
        readMediaCdnPurgeMetrics().then(renderMediaCdnPurgeMetrics,
          () => renderMediaCdnPurgeMetrics(null)),
      ])
        .then((parts) => {
          const metrics = [...parts, chat2OutboxExecutionMetrics.render()].join("\n");
          res.writeHead(200, {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(method === "GET" ? metrics : undefined);
        })
        .catch(() => {
          log.error("Media metrics render failed", Error("MEDIA_METRICS_UNAVAILABLE"));
          res.writeHead(503, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end("# media_metrics_error 1\n");
        });
      return;
    }

    // Bounded SDK57 ingest/export metrics, kept independent from product queues.
    if ((method === "GET" || method === "HEAD") && path === "/metrics/mobile-telemetry") {
      Promise.all([
        renderMobileTelemetryMetricsPrometheus(),
        readOtaOperationalTelemetry().then(renderOtaOperationalMetrics,
          () => renderOtaOperationalMetrics(null)),
        readWalkGpsOperationalMetrics().then(renderWalkGpsMetrics, () => renderWalkGpsMetrics(null)),
      ]).then(([metrics, ota, gps]) => {
        const body = metrics + ota + gps + renderServerDiagnosticOtlpMetrics();
        res.writeHead(200, {"Content-Type":"text/plain; version=0.0.4; charset=utf-8",
          "Cache-Control":"no-store"});
        res.end(method === "GET" ? body : undefined);
      }).catch(() => {
        res.writeHead(503, {"Content-Type":"text/plain; charset=utf-8",
          "Cache-Control":"no-store"});
        res.end("# mobile_telemetry_metrics_unavailable 1\n");
      });
      return;
    }

    // Separate endpoint: mail alerts remain available even if subscription metrics fail.
    if ((method === "GET" || method === "HEAD") && path === "/metrics/mail") {
      renderMailDeliveryMetricsPrometheus()
        .then((metrics) => {
          res.writeHead(200, {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          });
          res.end(method === "GET" ? metrics : undefined);
        })
        .catch(() => {
          log.error("Mail metrics render failed", Error("MAIL_METRICS_UNAVAILABLE"));
          res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" });
          res.end(method === "GET" ? "# TYPE gafus_mail_metrics_available gauge\ngafus_mail_metrics_available 0\n" : undefined);
        });
      return;
    }

    if ((method === "GET" || method === "HEAD") && path === "/metrics") {
      renderAppSubscriptionMetricsPrometheus()
        .then((metrics) => {
          res.writeHead(200, {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          });
          if (method === "GET") {
            res.end(metrics);
          } else {
            res.end();
          }
        })
        .catch((error) => {
          log.error("Metrics render failed", error as Error);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("# metrics_error 1\n");
        });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end('{"error":"Not found"}');
  });

  server.listen(port, "0.0.0.0", () => {
    log.info(`Health server listening on 0.0.0.0:${port}`);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    // Stop taking new jobs immediately. Bound draining so a stuck provider
    // cannot prevent the container from restarting; unfinished leases retry.
    void Promise.race([
      Promise.resolve().then(beforeShutdown).catch(() => log.error("Worker shutdown failed")),
      new Promise<void>(resolve => setTimeout(resolve, 4_000)),
    ]).then(() => Promise.race([
      flushServerTelemetry().catch(() => undefined),
      new Promise<void>(resolve => setTimeout(resolve, 4_500)),
    ])).finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  server.once("close", () => {
    if (shuttingDown) return;
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGINT", shutdown);
  });

  return server;
}
