import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import { deletePetDocumentForUser, renamePetDocumentForUser } from "@shared/lib/pets/server";
import { requireWebAppSubscriptionOrThrow } from "@shared/lib/app-subscription/server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

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
    await requireWebAppSubscriptionOrThrow(userId);

    const { petId, documentId } = await context.params;
    const deleted = await deletePetDocumentForUser(documentId, userId, petId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Документ не найден", code: "DOCUMENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    logger.error("Ошибка при удалении документа питомца", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const DELETE = withCSRFProtection(deleteHandler);

async function renameHandler(request: Request, context: RouteContext) {
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

    const { petId, documentId } = await context.params;
    const body = (await request.json()) as { name?: string };
    const nextName = body?.name?.trim() ?? "";
    if (!nextName) {
      return NextResponse.json(
        { success: false, error: "Название документа не может быть пустым", code: "INVALID_NAME" },
        { status: 400 },
      );
    }

    const updated = await renamePetDocumentForUser(documentId, userId, nextName, petId);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Документ не найден", code: "DOCUMENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    logger.error("Ошибка при обновлении названия документа питомца", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const PUT = withCSRFProtection(renameHandler);
