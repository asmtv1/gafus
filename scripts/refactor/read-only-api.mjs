/**
 * MIG-SEC-003 local-only, offline development mock.
 * Never proxies, contacts a remote service or touches a database.
 * No secrets or production env vars are loaded.
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const LOCAL_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
const LOOPBACK = "127.0.0.1";
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function json(response, status, value, method = "GET") {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(method === "HEAD" ? undefined : JSON.stringify(value));
}

export function createReadOnlyApiServer() {
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";
    const origin = request.headers.origin;
    if (origin && LOCAL_ORIGINS.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }
    const host = request.headers.host;
    // Prevent DNS rebinding and routing through nonlocal Host headers.
    if (!host || !/^127\.0\.0\.1(?::\d+)?$/.test(host)) {
      json(response, 403, { success: false, error: "LOCAL_ONLY" }, method);
      return;
    }
    if (!READ_METHODS.has(method)) {
      json(response, 403, { success: false, error: "READ_ONLY_DEVELOPMENT" }, method);
      return;
    }
    if (method === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.end();
      return;
    }
    let path;
    try {
      path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      json(response, 400, { success: false, error: "INVALID_PATH" }, method);
      return;
    }
    switch (path) {
      case "/health":
        json(response, 200, { status: "ok", source: "gafus-refactor-local-mock" }, method);
        break;
      case "/api/v1/courses":
      case "/api/v1/public/courses":
        json(response, 200, { success: true, data: [] }, method);
        break;
      case "/api/v1/auth/me":
      case "/api/v1/user/me":
        json(response, 401, { success: false, error: "UNAUTHORIZED" }, method);
        break;
      default:
        json(response, 404, { success: false, error: "MOCK_ENDPOINT_NOT_IMPLEMENTED" }, method);
    }
  });
  // Explicitly reject HTTP upgrades (no proxy / websocket tunnel).
  server.on("upgrade", (_, socket) => socket.destroy());
  return server;
}

export function listenLocal(server, port = 4174) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("Port must be 0..65535");
  }
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, LOOPBACK, () => {
      server.removeListener("error", reject);
      resolve(server.address());
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.GAFUS_REFACTOR_MOCK_PORT
    ? Number(process.env.GAFUS_REFACTOR_MOCK_PORT)
    : 4174;
  const server = createReadOnlyApiServer();
  listenLocal(server, port)
    .then(() => process.stdout.write("GAFUS Refactor mock API: http://127.0.0.1:" + server.address().port + "\n"))
    .catch((err) => {
      process.stderr.write(String(err) + "\n");
      process.exitCode = 1;
    });
}
