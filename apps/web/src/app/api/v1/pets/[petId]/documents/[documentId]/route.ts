import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-api-pet-document-item");

type RouteContext = {
  params: Promise<{ petId: string; documentId: string }>;
};

async function deleteHandler(_request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { petId, documentId } = await context.params;
    const { deletePetDocument } = await import("@gafus/core/services/pets");
    const deleted = await deletePetDocument(documentId, userId, petId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Документ не найден", code: "DOCUMENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Ошибка при удалении документа питомца", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const DELETE = withCSRFProtection(deleteHandler);
