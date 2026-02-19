import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getVideoInfoForStreaming } from "@gafus/core/services/trainerVideo";
import { getVideoAccessService } from "@gafus/video-access";
import { streamFileFromCDN } from "@gafus/cdn-upload";

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
    const video = await getVideoInfoForStreaming(videoId);

    if (!video) {
      return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
    }

    if (video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
      return NextResponse.json({ error: "Видео не готово" }, { status: 425 });
    }

    // Формируем полный путь к сегменту
    const baseDir = video.hlsManifestPath.split("/").slice(0, -1).join("/");
    const fullSegmentPath = `${baseDir}/${segmentPath}`;

    // Получаем stream для сегмента из Object Storage
    const { stream, contentLength, contentType } = await streamFileFromCDN(fullSegmentPath);

    // Возвращаем сегмент через streaming
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType || "video/mp2t",
        "Content-Length": contentLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Error serving HLS segment:", error);
    return NextResponse.json({ error: "Ошибка получения сегмента" }, { status: 500 });
  }
}
