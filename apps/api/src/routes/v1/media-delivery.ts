import { Hono } from "hono";
import { connection as redis } from "@gafus/queues";
import { MEDIA_DELIVERY_HEALTH_KEY, parseMonitoredMediaDeliveryStatus } from
  "@gafus/core/services/mediaDelivery";

/** Public status contains no tokens or media keys. Private S3 links are granted
 * only by existing authenticated Gallery/Feed fallback endpoints.
 */
export const mediaDeliveryRoutes = new Hono();
mediaDeliveryRoutes.get("/status", async c => {
  let raw: string | null = null;
  try { raw = await redis.get(MEDIA_DELIVERY_HEALTH_KEY); }
  catch { /* Missing Redis health cannot activate direct storage access. */ }
  c.header("Cache-Control", "no-store");
  return c.json({ success: true, data: parseMonitoredMediaDeliveryStatus(raw) });
});
