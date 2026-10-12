import { createServer } from "node:http";
import { handler } from "./origin.js";

// Edge must verify token expiry even when content is served from its cache.
if (process.env.FEED_CDN_EDGE_TOKEN_VERIFIED !== "true")
  throw new Error("FEED_CDN_EDGE_TOKEN_NOT_VERIFIED");
if (!/^[A-Za-z0-9_-]{24,32}$/.test(process.env.FEED_CDN_SECRET ?? ""))
  throw new Error("FEED_CDN_SECRET_REQUIRED");
if (Buffer.byteLength(process.env.FEED_ORIGIN_SECRET ?? "") < 32)
  throw new Error("FEED_ORIGIN_SECRET_REQUIRED");
const port = Number(process.env.PORT ?? "8080");
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("INVALID_PORT");
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  const raw = req.url ?? "";
  if (!raw.startsWith("/") || raw.length > 4096) {
    res.writeHead(400).end();
    return;
  }
  try {
    const result = await handler({
      httpMethod: req.method,
      rawPath: raw.split("?")[0],
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value[0] : value,
        ]),
      ),
    });
    for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
    const data =
      "isBase64Encoded" in result && result.isBase64Encoded
        ? Buffer.from(result.body ?? "", "base64")
        : Buffer.from(result.body ?? "", "utf8");
    res.writeHead(result.statusCode).end(req.method === "HEAD" ? undefined : data);
  } catch {
    if (!res.headersSent) res.writeHead(503).end();
    else res.destroy();
  }
});
server.listen(port, "0.0.0.0");
process.on("SIGTERM", () => server.close());
