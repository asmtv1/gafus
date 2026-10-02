import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { z } from "zod";
import { setPetTargetWeight } from "@gafus/core/services/pets";

async function put(request: NextRequest, context: { params: Promise<{ petId: string }> }) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId)
    return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
  const parsed = z
    .object({ targetWeightKg: z.number().finite().min(0.1).max(200).nullable() })
    .safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: "Проверьте целевой вес" }, { status: 400 });
  const saved = await setPetTargetWeight(
    (await context.params).petId,
    userId,
    parsed.data.targetWeightKg,
  );
  return saved
    ? NextResponse.json({ success: true })
    : NextResponse.json({ success: false, error: "Питомец не найден" }, { status: 404 });
}

export const PUT = withCSRFProtection(put);
