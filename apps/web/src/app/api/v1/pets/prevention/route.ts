import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { getPreventionEntriesByPetsForUser } from "@shared/lib/pet-prevention";
import { requireWebAppSubscriptionOrThrow } from "@shared/lib/app-subscription/server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

const logger = createWebLogger("web-api-pets-prevention-list");

type PetPreventionDomainErrorCode = "PREVENTION_LOAD_FAILED";

function getPetPreventionDomainErrorCode(error: unknown): PetPreventionDomainErrorCode | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const code = (error as Error & { code?: string }).code;
  if (code === "PREVENTION_LOAD_FAILED") {
    return code;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    await requireWebAppSubscriptionOrThrow(userId);

    const { searchParams } = new URL(request.url);
    const rawPetIds = searchParams.get("petIds") ?? "";
    const petIds = rawPetIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const entriesByPets = await getPreventionEntriesByPetsForUser(userId, petIds);
    return NextResponse.json({ success: true, data: entriesByPets });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const errorCode = getPetPreventionDomainErrorCode(error);
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
    logger.error("Ошибка при получении записей профилактики по питомцам", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
