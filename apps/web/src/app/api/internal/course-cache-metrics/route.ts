import {
  canReadCourseCacheMetrics,
  getCourseCacheMetricsSnapshot,
} from "@gafus/core/services/training";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const headers = { "Cache-Control": "no-store" };
  if (!canReadCourseCacheMetrics(request.headers.get("Authorization"))) {
    return new Response(null, { status: 404, headers });
  }
  return Response.json(getCourseCacheMetricsSnapshot(), { headers });
}
