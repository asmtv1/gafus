import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { createWorkerLogger } from "@gafus/logger";

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
