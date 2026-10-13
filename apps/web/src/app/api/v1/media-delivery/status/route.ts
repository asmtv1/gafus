import { connection as redis } from "@gafus/queues";
import { MEDIA_DELIVERY_HEALTH_KEY, parseMonitoredMediaDeliveryStatus } from
  "@gafus/core/services/mediaDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  let raw: string | null = null;
  try { raw = await redis.get(MEDIA_DELIVERY_HEALTH_KEY); }
  catch { /* Fail safely back to normal CDN; browser regional fallback remains. */ }
  return Response.json({ success: true, data: parseMonitoredMediaDeliveryStatus(raw) },
    { headers: { "Cache-Control": "no-store" } });
}
