import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { dispatchGalleryRequest, galleryHttpError } from "@gafus/gallery-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = (response: NextResponse) => {
  response.headers.set("Cache-Control", "no-store");
  return response;
};
async function handle(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  let session;
  try { session = await getServerSession(authOptions); }
  catch { return NextResponse.json({ success: false, error: "Не удалось проверить авторизацию", code: "AUTH_UNAVAILABLE" }, { status: 503, headers }); }
  if (!session?.user?.id)
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401, headers });
  try {
    const path = request.nextUrl.pathname.slice("/api/v1/gallery".length);
    return NextResponse.json({ success: true, data: await dispatchGalleryRequest(session.user.id, request, path) }, { headers });
  } catch (error) {
    const mapped = galleryHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers });
  }
}
const withNoStore = (handler: (request: NextRequest) => Promise<NextResponse>) => async (request: NextRequest) => noStore(await handler(request));
export const GET = withNoStore(handle);
export const POST = withNoStore(withCSRFProtection(handle));
export const PATCH = withNoStore(withCSRFProtection(handle));
export const PUT = withNoStore(withCSRFProtection(handle));
export const DELETE = withNoStore(withCSRFProtection(handle));
