import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import { listPetDocumentsForUser, uploadPetDocumentForUser } from "@shared/lib/pets/server";
import { requireWebAppSubscriptionOrThrow } from "@shared/lib/app-subscription/server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

const logger = createWebLogger("web-api-pet-documents");

type RouteContext = {
  params: Promise<{ petId: string }>;
};

type PetDocumentsDomainErrorCode =
  | "PET_NOT_FOUND"
  | "INVALID_DOCUMENT_TYPE"
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_LIMIT_REACHED";

function getPetDocumentsDomainErrorCode(error: unknown): PetDocumentsDomainErrorCode | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const code = (error as Error & { code?: string }).code;
  if (
    code === "PET_NOT_FOUND" ||
    code === "INVALID_DOCUMENT_TYPE" ||
    code === "DOCUMENT_TOO_LARGE" ||
    code === "DOCUMENT_LIMIT_REACHED"
  ) {
    return code;
  }
  return null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
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

    const { petId } = await context.params;
    const documents = await listPetDocumentsForUser(petId, userId);
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const errorCode = getPetDocumentsDomainErrorCode(error);
    if (errorCode === "PET_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Питомец не найден", code: "PET_NOT_FOUND" },
        { status: 404 },
      );
    }
    logger.error("Ошибка при получении документов питомца", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

async function postHandler(request: NextRequest, context: RouteContext) {
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

    const { petId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Файл не найден", code: "FILE_REQUIRED" },
        { status: 400 },
      );
    }

    const document = await uploadPetDocumentForUser(petId, userId, file);
    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const errorCode = getPetDocumentsDomainErrorCode(error);
    if (errorCode === "PET_NOT_FOUND") {
      return NextResponse.json(
        {
          success: false,
          error: "Питомец не найден",
          code: "PET_NOT_FOUND",
        },
        { status: 404 },
      );
    }
    if (errorCode === "INVALID_DOCUMENT_TYPE") {
      return NextResponse.json(
        { success: false, error: "Недопустимый тип документа. Разрешены PDF, JPEG и PNG", code: errorCode },
        { status: 400 },
      );
    }
    if (errorCode === "DOCUMENT_TOO_LARGE") {
      return NextResponse.json(
        { success: false, error: "Размер документа превышает 10 МБ", code: errorCode },
        { status: 400 },
      );
    }
    if (errorCode === "DOCUMENT_LIMIT_REACHED") {
      return NextResponse.json(
        { success: false, error: "Достигнут лимит документов питомца", code: errorCode },
        { status: 400 },
      );
    }
    logger.error("Ошибка при загрузке документа питомца", error as Error);
    return NextResponse.json(
      {
        success: false,
        error: "Внутренняя ошибка сервера",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500 },
    );
  }
}

export const POST = withCSRFProtection(postHandler);
