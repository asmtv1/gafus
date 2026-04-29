import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { preparePetDocumentDownloadForUser } from "@shared/lib/pets/server";

const logger = createWebLogger("web-api-pet-document-download");

type RouteContext = {
  params: Promise<{ petId: string; documentId: string }>;
};

function buildContentDisposition(fileName: string): string {
  const asciiFallbackName = fileName
    .replace(/["\\]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const safeFileName = asciiFallbackName || "document";
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${safeFileName}"; filename*=UTF-8''${encoded}`;
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

    const { petId, documentId } = await context.params;
    const downloadPayload = await preparePetDocumentDownloadForUser(documentId, userId, petId);
    if (!downloadPayload) {
      return NextResponse.json(
        { success: false, error: "Документ не найден", code: "DOCUMENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    const fileResponse = await fetch(downloadPayload.downloadUrl);
    if (!fileResponse.ok || !fileResponse.body) {
      logger.error("Не удалось получить файл документа из CDN", new Error("DOCUMENT_FETCH_FAILED"), {
        petId,
        documentId,
        status: fileResponse.status,
      });
      return NextResponse.json(
        { success: false, error: "Не удалось скачать документ", code: "DOCUMENT_FETCH_FAILED" },
        { status: 502 },
      );
    }

    return new NextResponse(fileResponse.body, {
      status: 200,
      headers: {
        "Content-Type": downloadPayload.mimeType,
        "Content-Disposition": buildContentDisposition(downloadPayload.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error("Ошибка при скачивании документа питомца", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
