import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getVideoAccessService } from "@gafus/video-access";
import { streamFileFromCDN } from "@gafus/cdn-upload";
import { checkVideoAccess } from "@gafus/core/services/video";

/**
 * API для получения HLS сегмента
 * GET /api/video/[videoId]/segment?path=segment-001.ts&token=<jwt>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { videoId } = await params;
    const videoAccessService = getVideoAccessService();

    // Получаем параметры из query
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");
    const segmentPath = searchParams.get("path");

    if (!token) {
      return NextResponse.json({ error: "Токен не предоставлен" }, { status: 401 });
    }

    if (!segmentPath) {
      return NextResponse.json({ error: "Путь к сегменту не предоставлен" }, { status: 400 });
    }

    // P0 Security: Валидация segmentPath для защиты от path traversal
    if (segmentPath.includes("..") || segmentPath.includes("/") || segmentPath.includes("\\")) {
      return NextResponse.json({ error: "Недопустимый путь к сегменту" }, { status: 400 });
    }

    // Валидация формата файла (только .ts, .m3u8, .vtt)
    const validSegmentPattern = /^[a-zA-Z0-9._-]+\.(ts|m3u8|vtt)$/;
    if (!validSegmentPattern.test(segmentPath)) {
      return NextResponse.json({ error: "Недопустимый формат сегмента" }, { status: 400 });
    }

    // Проверяем токен
    const tokenData = videoAccessService.verifyToken(token);

    if (!tokenData) {
      return NextResponse.json({ error: "Недействительный токен" }, { status: 403 });
    }

    // Проверяем, что токен для этого видео и этого пользователя
    if (tokenData.videoId !== videoId || tokenData.userId !== session.user.id) {
      return NextResponse.json({ error: "Недостаточно прав доступа" }, { status: 403 });
    }

    // Получаем информацию о видео из БД
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: {
        hlsManifestPath: true,
        transcodingStatus: true,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
    }

    // P0 Security: Проверяем права доступа к видео (IDOR protection)
    const hasAccess = await checkVideoAccess({
      userId: session.user.id,
      videoId,
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Недостаточно прав для просмотра этого видео" },
        { status: 403 },
      );
    }

    if (video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
      return NextResponse.json({ error: "Видео не готово" }, { status: 425 });
    }

    // Формируем полный путь к сегменту
    const baseDir = video.hlsManifestPath.split("/").slice(0, -1).join("/");
    const fullSegmentPath = `${baseDir}/${segmentPath}`;

    // Поддержка Range обязательна для мобильных (iOS/Android), иначе HLS вечно грузится
    const rangeHeader = request.headers.get("range");
    const validRange =
      rangeHeader?.startsWith("bytes=") && !rangeHeader.includes(",")
        ? rangeHeader
        : undefined;

    const { stream, contentLength, contentType, contentRange, isPartialContent } =
      await streamFileFromCDN(fullSegmentPath, validRange);

    // P1 Security: Строгая CORS policy вместо "*"
    const origin = request.headers.get("origin");
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_APP_URL || "https://gafus.ru",
      "http://localhost:3000",
      "https://gafus.ru",
      "https://www.gafus.ru",
    ].filter((url): url is string => Boolean(url));

    const corsOrigin =
      origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const headers: Record<string, string> = {
      "Content-Type": contentType || "video/mp2t",
      "Content-Length": contentLength.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
      "Accept-Ranges": "bytes",
    };
    if (contentRange) {
      headers["Content-Range"] = contentRange;
    }

    return new NextResponse(stream, {
      status: isPartialContent ? 206 : 200,
      headers,
    });
  } catch (error) {
    console.error("Error serving HLS segment:", error);
    return NextResponse.json({ error: "Ошибка получения сегмента" }, { status: 500 });
  }
}
