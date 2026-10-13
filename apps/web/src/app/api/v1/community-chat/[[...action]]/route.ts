import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { chatHttpError, dispatchChatRequest } from "@gafus/chat-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401, headers });
  try {
    const action = request.nextUrl.pathname.split("/community-chat")[1]?.replace(/^\//, "") ?? "";
    const data = await dispatchChatRequest(session.user.id, request, action, true);
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) {
    const mapped = chatHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers });
  }
}
export const GET = handle;
export const POST = withCSRFProtection(handle);
export const DELETE = withCSRFProtection(handle);
