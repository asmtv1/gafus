import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { preparePetDocumentDownloadForUser } from "@shared/lib/pets/server";
import { trustedLegacyPetDocumentSource } from "@shared/lib/pets/trusted-document-source";

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

    // Private Cloud.ru objects use a short-lived, owner-approved direct S3 presign.
    const parsedDownload = new URL(downloadPayload.downloadUrl);
    if (parsedDownload.protocol === "https:" && parsedDownload.hostname === "s3.cloud.ru") {
      const response = NextResponse.redirect(parsedDownload.toString(), 307);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }

    if (!trustedLegacyPetDocumentSource(downloadPayload.downloadUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: "Недопустимый источник документа",
          code: "DOCUMENT_SOURCE_INVALID",
        },
        { status: 502 },
      );
    }
    const fileResponse = await fetch(parsedDownload.toString(), {
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!fileResponse.ok || !fileResponse.body) {
      logger.error(
        "Не удалось получить файл документа из CDN",
        new Error("DOCUMENT_FETCH_FAILED"),
        {
          petId,
          documentId,
          status: fileResponse.status,
        },
      );
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
