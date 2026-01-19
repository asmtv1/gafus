/**
 * API: PUT/DELETE /api/v1/pets/[petId] - обновить/удалить питомца
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError, NotFoundError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger('api-pets-item');

const updatePetSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  breed: z.string().optional(),
  birthDate: z.string().optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
});

type RouteContext = {
  params: Promise<{ petId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const { petId } = await context.params;
    const body = await request.json();
    const parsed = updatePetSchema.parse(body);

    // Динамический импорт
    const { updatePet } = await import("@shared/lib/pets");
    
    const pet = await updatePet({ id: petId, ...parsed });
    return NextResponse.json({ success: true, data: pet });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message, code: "UNAUTHORIZED" }, { status: 401 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ success: false, error: error.message, code: "NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0]?.message || "Ошибка валидации", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Питомец не найден") {
      return NextResponse.json({ success: false, error: "Питомец не найден", code: "NOT_FOUND" }, { status: 404 });
    }
    logger.error("API: Error updating pet", error as Error);
    return NextResponse.json({ success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const { petId } = await context.params;

    // Динамический импорт
    const { deletePet } = await import("@shared/lib/pets");
    
    await deletePet(petId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message, code: "UNAUTHORIZED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Питомец не найден") {
      return NextResponse.json({ success: false, error: "Питомец не найден", code: "NOT_FOUND" }, { status: 404 });
    }
    logger.error("API: Error deleting pet", error as Error);
    return NextResponse.json({ success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
