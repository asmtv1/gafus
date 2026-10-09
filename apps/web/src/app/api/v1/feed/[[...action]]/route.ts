import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { dispatchFeedRequest, feedHttpError } from "@gafus/feed-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function handle(request: NextRequest) {
  let session;
  try { session = await getServerSession(authOptions); }
  catch { return NextResponse.json({ success: false, error: "Не удалось проверить авторизацию", code: "AUTH_UNAVAILABLE" }, { status: 503, headers }); }
  if (!session?.user?.id)
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401, headers });
  try {
    const path = request.nextUrl.pathname.slice("/api/v1/feed".length);
    return NextResponse.json({ success: true, data: await dispatchFeedRequest(session.user.id, request, path) }, { headers });
  } catch (error) {
    const mapped = feedHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers });
  }
}
const noStore = (fn: (request: NextRequest) => Promise<NextResponse>) => async (request: NextRequest) => {
  const result = await fn(request); result.headers.set("Cache-Control", "no-store"); return result;
};
export const GET = noStore(handle);
export const POST = noStore(withCSRFProtection(handle));
export const PATCH = noStore(withCSRFProtection(handle));
export const PUT = noStore(withCSRFProtection(handle));
export const DELETE = noStore(withCSRFProtection(handle));
