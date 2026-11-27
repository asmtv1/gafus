import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireRole } from "../../middleware/auth.js";
import { readAdminActorRole } from "../../modules/admin-users/composition/service.js";

const prefix = "/api/v1/admin/queues";
const boardOrigin = () => process.env.NODE_ENV === "production"
  ? "http://gafus-bull-board:3002" : "http://127.0.0.1:3004";

/** Server-verified current role. The Bull Board container calls this even
 * for direct requests; a role header or stale JWT role alone is insufficient. */
export const adminQueuesAccessRoutes = new Hono();
adminQueuesAccessRoutes.get("/", requireRole("ADMIN"), async c => {
  c.header("Cache-Control", "private, no-store");
  try {
    if (await readAdminActorRole(c.get("user").id) !== "ADMIN") return c.body(null, 403);
    return c.body(null, 204);
  } catch { return c.body(null, 503); }
});

/** Fixed-origin, same-origin browser gateway for Bull Board. The access
 * cookie has Path=/api/v1; do not weaken its scope for queues.gafus.ru.
 * Generic upstream mutation endpoints are NOT proxied. */
export const adminQueuesRoutes = new Hono();
adminQueuesRoutes.use("*", requireRole("ADMIN"), async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
adminQueuesRoutes.use("/operations/replay", bodyLimit({ maxSize: 2048 }));
adminQueuesRoutes.all("*", async c => {
  const url = new URL(c.req.url);
  const pathname = url.pathname;
  const read = c.req.method === "GET" || c.req.method === "HEAD";
  const replay = c.req.method === "POST" && pathname === prefix + "/operations/replay";
  if ((!read && !replay) ||
      (pathname !== prefix && !pathname.startsWith(prefix + "/")) ||
      /(?:%2f|%5c|%2e|\\|\/\/)/i.test(pathname)) return c.body(null, 405);
  if (replay && !/^application\/x-www-form-urlencoded(?:;|$)/i.test(c.req.header("content-type") ?? ""))
    return c.body(null, 415);
  const headers = new Headers();
  const authorization = c.req.header("authorization");
  const access = c.req.header("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("gafus_access="));
  if (authorization) headers.set("authorization", authorization);
  else if (access) headers.set("cookie", access);
  if (replay) {
    headers.set("content-type", c.req.header("content-type")!);
    const origin = c.req.header("origin");
    if (origin) headers.set("origin", origin);
  }
  try {
    const upstream = await fetch(boardOrigin() + pathname + url.search, {
      method: c.req.method, headers, redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      ...(replay ? { body: await c.req.text() } : {}),
    });
    const out = new Headers({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
    const type = upstream.headers.get("content-type");
    if (type) out.set("content-type", type);
    const csp = upstream.headers.get("content-security-policy");
    if (csp) out.set("content-security-policy", csp);
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location || !location.startsWith(prefix + "/") || location.startsWith("//")) return c.body(null, 502);
      out.set("location", location);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    // A timed-out replay could have reached Redis. Do not auto-retry.
    return c.text(replay ? "UNKNOWN_ACK — обновите состояние задания, не повторяйте вслепую" : "QUEUE_BOARD_UNAVAILABLE", 503);
  }
});
