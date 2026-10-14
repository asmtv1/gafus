import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { createWorkerLogger } from "@gafus/logger";
import { renderAppSubscriptionMetricsPrometheus } from "./app-subscription-metrics";
import { renderMailDeliveryMetricsPrometheus } from "./mail-delivery-monitor";

const HEALTH_BODY = '{"ok":true}';

/**
 * Лёгкий HTTP-сервер для /health (liveness).
 * Использует только node:http, без внешних зависимостей.
 */
export function startHealthServer(): Server {
  const port = parseInt(process.env.WORKER_HEALTH_PORT ?? "3003", 10);
  const log = createWorkerLogger("health-server");

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? "";
    const path = (req.url ?? "").split("?")[0];

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

    // Separate endpoint: mail alerts remain available even if subscription metrics fail.
    if ((method === "GET" || method === "HEAD") && path === "/metrics/mail") {
      renderMailDeliveryMetricsPrometheus()
        .then((metrics) => {
          res.writeHead(200, {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          });
          res.end(method === "GET" ? metrics : undefined);
        })
        .catch((error) => {
          log.error("Mail metrics render failed", error as Error);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("# mail_metrics_error 1\n");
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

  process.on("SIGTERM", () => {
    setTimeout(() => {
      server.close(() => {
        process.exit(0);
      });
    }, 2000);
  });

  return server;
}
