import { createServer } from "node:http";
import type { OriginEvent } from "./origin-handler.js";
type OriginReply = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
};
/** Thin HTTP transport. Access checks and image-size limits remain in the domain origin. */
export function createOriginHttpServer(handle: (event: OriginEvent) => Promise<OriginReply>) {
  return createServer(async (req, res) => {
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
      const url = new URL(raw, "http://internal.invalid");
      const result = await handle({
        httpMethod: req.method,
        path: raw.split("?")[0],
        url: raw,
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
        ),
        queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      });
      for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
      const data = result.isBase64Encoded
        ? Buffer.from(result.body ?? "", "base64")
        : Buffer.from(result.body ?? "", "utf8");
      res.writeHead(result.statusCode).end(req.method === "HEAD" ? undefined : data);
    } catch {
      if (!res.headersSent) res.writeHead(503).end();
      else res.destroy();
    }
  });
}
