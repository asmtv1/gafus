import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
} from "@gafus/types";

const logger = createWebLogger("web-api-pet-documents");

type RouteContext = {
  params: Promise<{ petId: string }>;
};

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

    const { petId } = await context.params;
    const { listPetDocuments } = await import("@gafus/core/services/pets");
    const documents = await listPetDocuments(petId, userId);
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    if (error instanceof Error && error.message === "Питомец не найден") {
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

    const { petId } = await context.params;
    const { uploadPetDocument } = await import("@gafus/core/services/pets");
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Файл не найден", code: "FILE_REQUIRED" },
        { status: 400 },
      );
    }

    if (
      !PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(
        file.type as (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Недопустимый тип документа. Разрешены PDF, JPEG и PNG",
          code: "INVALID_DOCUMENT_TYPE",
        },
        { status: 400 },
      );
    }
    if (file.size > PET_DOCUMENT_MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Размер документа превышает 10 МБ", code: "DOCUMENT_TOO_LARGE" },
        { status: 400 },
      );
    }

    const document = await uploadPetDocument(petId, userId, file);
    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Питомец не найден") {
      return NextResponse.json(
        { success: false, error: "Питомец не найден", code: "PET_NOT_FOUND" },
        { status: 404 },
      );
    }
    logger.error("Ошибка при загрузке документа питомца", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const POST = withCSRFProtection(postHandler);
