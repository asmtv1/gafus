/** A2 isolated QA launcher: never part of production startup. */
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import {
  authorizedOperationMetrics,
  getRequestCorrelation,
  withCorrelatedUseCase,
} from "./lib/operation-observability.js";
import { startCorrelatedSpan, withServerSpan } from "@gafus/logger/server-telemetry";

const port = Number(process.env.A2_OBS_API_PORT);
const db = new URL(process.env.DATABASE_URL ?? "http://invalid");
const redis = new URL(process.env.REDIS_URL ?? "http://invalid");
if (process.env.GAFUS_A2_OBS_ISOLATED !== "1" ||
    ![56244, 56245].includes(port) ||
    process.env.API_HOST !== "127.0.0.1" ||
    process.env.NODE_ENV !== "development" ||
    db.protocol !== "postgresql:" || db.hostname !== "127.0.0.1" ||
    db.port !== "56241" || db.pathname !== "/gafus_a2_observability" ||
    redis.protocol !== "redis:" || redis.hostname !== "127.0.0.1" ||
    redis.port !== "56242" ||
    !process.env.API_METRICS_KEY || process.env.API_METRICS_KEY.length < 32 ||
    process.env.CLOUDRU_MEDIA_JOBS_ENABLED !== "false") {
  throw new Error("A2_PRIVATE_API_PREFLIGHT_DENIED");
}
// Dynamic import only after isolated dependency preflight.
const { app } = await import("./app.js");
const { a2ObservabilityFixture } = await import("../../../packages/prisma/tests/a2ObservabilityFixture.js");
const protectedFixture = (auth: string | undefined) =>
  authorizedOperationMetrics(auth, process.env.API_METRICS_KEY);
app.post("/__a2_obs_enqueue", async c => {
  if (!protectedFixture(c.req.header("Authorization"))) return c.body(null, 404);
  const correlation = getRequestCorrelation();
  if (!("operationId" in correlation) || !("traceId" in correlation))
    return c.json({ error: "MISSING_CORRELATION" }, 500);
  const eventId = "a2-obs-" + randomUUID();
  await withCorrelatedUseCase("chat2.synthetic.outbox.enqueue", () =>
    a2ObservabilityFixture.enqueue(eventId, correlation.operationId, correlation.traceId),
  );
  return c.json({ eventId, operationId: correlation.operationId, traceId: correlation.traceId }, 202);
});
app.post("/__a2_obs_callback", async c => {
  if (!protectedFixture(c.req.header("Authorization"))) return c.body(null, 404);
  const eventId = c.req.header("X-A2-Event-Id");
  if (!eventId || !/^a2-obs-[0-9a-f-]{36}$/.test(eventId)) return c.body(null, 400);
  const event = await a2ObservabilityFixture.readEvent(eventId);
  if (!event || !event.deliveredAt || !event.operationId) return c.body(null, 409);
  const current = getRequestCorrelation();
  const callbackTraceId = "traceId" in current ? current.traceId : undefined;
  const span = startCorrelatedSpan({
    name: "chat2.synthetic.callback.reconcile", service: "gafus-api", kind: "internal",
    traceId: callbackTraceId, operationId: event.operationId,
  });
  try {
    await withServerSpan(span, () => a2ObservabilityFixture.countDeliveries(eventId));
  } finally {
    span.end();
  }
  return c.json({ operationId: event.operationId, traceId: callbackTraceId,
    requestId: "requestId" in current ? current.requestId : undefined });
});
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
console.log("A2_PRIVATE_REAL_API_LISTENING", port);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
