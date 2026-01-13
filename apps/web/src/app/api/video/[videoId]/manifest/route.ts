import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getVideoAccessService } from "@gafus/video-access";
import { downloadFileFromCDN } from "@gafus/cdn-upload";

/**
 * API для получения HLS манифеста с подписанными URL для сегментов
 * GET /api/video/[videoId]/manifest?token=<jwt>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { videoId } = await params;
    const videoAccessService = getVideoAccessService();

    // Получаем токен из query параметров
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Токен не предоставлен" }, { status: 401 });
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
        relativePath: true,
        trainerId: true,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
    }

    // Проверяем статус транскодирования
    if (video.transcodingStatus !== "COMPLETED") {
      return NextResponse.json(
        { 
          error: "Видео ещё обрабатывается",
          status: video.transcodingStatus,
        },
        { status: 425 } // 425 Too Early
      );
    }

    if (!video.hlsManifestPath) {
      return NextResponse.json({ error: "HLS манифест не найден" }, { status: 404 });
    }

    // Скачиваем манифест из Object Storage
    const manifestBuffer = await downloadFileFromCDN(video.hlsManifestPath);
    const manifestContent = manifestBuffer.toString("utf-8");

    // Получаем base URL для формирования абсолютных URL
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = headersList.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const baseUrl = host ? `${protocol}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

    // Парсим манифест и добавляем токены к URL сегментов
    const lines = manifestContent.split("\n");
    const modifiedLines = lines.map((line) => {
      // Если строка - это URL сегмента (не начинается с # и не пустая)
      if (line.trim() && !line.startsWith("#")) {
        // Генерируем signed URL для сегмента
        const segmentPath = line.trim();
        
        // Создаём абсолютный URL для прокси-эндпоинта сегмента
        const segmentUrl = `${baseUrl}/api/video/${videoId}/segment?path=${encodeURIComponent(segmentPath)}&token=${token}`;
        
        return segmentUrl;
      }
      return line;
    });

    const modifiedManifest = modifiedLines.join("\n");

    // Возвращаем модифицированный манифест
    return new NextResponse(modifiedManifest, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Error serving HLS manifest:", error);
    return NextResponse.json(
      { error: "Ошибка получения манифеста" },
      { status: 500 }
    );
  }
}
