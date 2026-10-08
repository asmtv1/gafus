import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { dispatchQuestionsRequest, questionHttpError } from "@gafus/questions-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401, headers });
  try {
    const path = request.nextUrl.pathname.split("/questions")[1] ?? "";
    return NextResponse.json(
      { success: true, data: await dispatchQuestionsRequest(session.user.id, request, path) },
      { headers },
    );
  } catch (error) {
    const mapped = questionHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers });
  }
}
export const GET = handle;
export const POST = withCSRFProtection(handle);
export const PATCH = withCSRFProtection(handle);
export const DELETE = withCSRFProtection(handle);
