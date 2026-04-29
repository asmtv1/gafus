import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { getPreventionEntriesByPetForUser } from "@shared/lib/pet-prevention";

const logger = createWebLogger("web-api-pet-prevention-list");

type RouteContext = {
  params: Promise<{ petId: string }>;
};

type PetPreventionDomainErrorCode = "PET_NOT_FOUND" | "PREVENTION_LOAD_FAILED";

function getPetPreventionDomainErrorCode(error: unknown): PetPreventionDomainErrorCode | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const code = (error as Error & { code?: string }).code;
  if (code === "PET_NOT_FOUND" || code === "PREVENTION_LOAD_FAILED") {
    return code;
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { petId } = await context.params;
    const entries = await getPreventionEntriesByPetForUser(userId, petId);
    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    const errorCode = getPetPreventionDomainErrorCode(error);
    if (errorCode === "PET_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Питомец не найден", code: "PET_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (errorCode === "PREVENTION_LOAD_FAILED") {
      return NextResponse.json(
        {
          success: false,
          error: "Не удалось загрузить записи о процедурах",
          code: "PREVENTION_LOAD_FAILED",
        },
        { status: 400 },
      );
    }
    logger.error("Ошибка при получении записей профилактики питомца", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
