import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { handlePetVetVisitRequest } from "@gafus/core/services/pets";
import { NextResponse, type NextRequest } from "next/server";

type Context = { params: Promise<{ petId: string; parts?: string[] }> };
async function handle(request: NextRequest, context: Context) {
  const ownerId = (await getServerSession(authOptions))?.user?.id;
  if (!ownerId)
    return NextResponse.json(
      { success: false, error: "Не авторизован" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  const { petId, parts = [] } = await context.params;
  const result = await handlePetVetVisitRequest(request, petId, ownerId, parts);
  return new NextResponse(result.body, { status: result.status, headers: result.headers });
}
export const GET = handle;
export const POST = withCSRFProtection(handle);
export const PUT = withCSRFProtection(handle);
export const DELETE = withCSRFProtection(handle);
