/**
 * API: GET/POST /api/v1/pets - получить/создать питомцев
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger("api-pets");

const createPetSchema = z.object({
  name: z.string().min(1, "Имя питомца обязательно"),
  type: z.string().min(1, "Тип питомца обязателен"),
  breed: z.string().min(1, "Порода обязательна"),
  birthDate: z.string().min(1, "Дата рождения обязательна"),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    // Динамический импорт
    const { getUserPets } = await import("@shared/lib/pets");

    const pets = await getUserPets();
    return NextResponse.json({ success: true, data: pets });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    logger.error("API: Error fetching pets", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const body = await request.json();
    const parsed = createPetSchema.parse(body);

    // Динамический импорт
    const { createPet } = await import("@shared/lib/pets");

    const pet = await createPet(parsed);
    return NextResponse.json({ success: true, data: pet });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: error.errors[0]?.message || "Ошибка валидации",
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }
    logger.error("API: Error creating pet", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
});
