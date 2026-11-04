/**
 * Opt-in internal Centrifugo subscribe proxy HTTP adapter.
 * NOT mounted on the public GAFUS API or enabled in production by this module.
 * A trusted Centrifugo sidecar sets a PRIVATE static header that is never
 * copied from a client WebSocket request. All grants recheck live room ACL.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authorizeChat2SubscriptionProxy } from "@gafus/core/services/chat2";

export const CHAT2_PROXY_SECRET_HEADER = "x-gafus-subscribe-proxy-key";
const maxBodyBytes = 8192;

export function createChat2SubscribeProxyRoutes(input: {
  brokerSharedSecret: string;
  checkCurrentMembership: (userId: string, roomId: string) => Promise<unknown>;
}) {
  if (!input.brokerSharedSecret || input.brokerSharedSecret.length < 32) {
    throw Error("CHAT2_SUBSCRIBE_PROXY_SECRET_MISSING");
  }
  const expected = createHash("sha256").update(input.brokerSharedSecret).digest();
  const routes = new Hono();
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  routes.post("/chat2-subscribe", bodyLimit({
    maxSize: maxBodyBytes,
    onError: c => c.json({ error: { code: 413, message: "payload too large" } }, 413),
  }), async c => {
    const token = c.req.header(CHAT2_PROXY_SECRET_HEADER) ?? "";
    // Compare digests in constant time, including missing/wrong-length secrets.
    // Never echo authorization credentials, user IDs, or room keys.
    const candidate = createHash("sha256").update(token).digest();
    if (!timingSafeEqual(expected, candidate)) {
      return c.json({ error: { code: 403, message: "permission denied" } }, 403);
    }
    if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return c.json({ error: { code: 400, message: "invalid request" } }, 400);
    }
    let payload: unknown;
    try { payload = await c.req.json(); }
    catch { return c.json({ error: { code: 400, message: "invalid request" } }, 400); }
    const decision = await authorizeChat2SubscriptionProxy(payload, input.checkCurrentMembership);
    return c.json(decision);
  });
  return routes;
}
