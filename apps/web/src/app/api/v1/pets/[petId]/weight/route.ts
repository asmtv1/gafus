import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { z } from "zod";
import { addPetWeightEntry, getPetWeightHistory } from "@gafus/core/services/pets";

type Context = { params: Promise<{ petId: string }> };
const schema = z.object({
  weightKg: z.number().finite().min(0.1).max(200),
  measuredAt: z.string().datetime({ offset: true }),
});

export async function GET(_request: NextRequest, context: Context) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId)
    return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
  const { petId } = await context.params;
  const data = await getPetWeightHistory(petId, userId);
  return data
    ? NextResponse.json({ success: true, data })
    : NextResponse.json({ success: false, error: "Питомец не найден" }, { status: 404 });
}

async function post(request: NextRequest, context: Context) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId)
    return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || new Date(parsed.data.measuredAt).getTime() > Date.now() + 60_000) {
    return NextResponse.json(
      { success: false, error: "Проверьте вес и дату измерения" },
      { status: 400 },
    );
  }
  const { petId } = await context.params;
  const data = await addPetWeightEntry(
    petId,
    userId,
    parsed.data.weightKg,
    new Date(parsed.data.measuredAt),
  );
  return data
    ? NextResponse.json({ success: true, data }, { status: 201 })
    : NextResponse.json({ success: false, error: "Питомец не найден" }, { status: 404 });
}

export const POST = withCSRFProtection(post);
