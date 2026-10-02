import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { deletePetWeightEntry } from "@gafus/core/services/pets";

async function remove(
  _request: NextRequest,
  context: { params: Promise<{ petId: string; entryId: string }> },
) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId)
    return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
  const { petId, entryId } = await context.params;
  const deleted = await deletePetWeightEntry(petId, userId, entryId);
  return deleted
    ? NextResponse.json({ success: true })
    : NextResponse.json({ success: false, error: "Измерение не найдено" }, { status: 404 });
}

export const DELETE = withCSRFProtection(remove);
