/**
 * API: GET /api/v1/video/playback-url - получить URL для воспроизведения видео
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger("api-video-playback-url");

const querySchema = z.object({
  videoUrl: z.string().min(1, "videoUrl обязателен"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const { searchParams } = request.nextUrl;
    const parsed = querySchema.parse({
      videoUrl: searchParams.get("videoUrl"),
    });

    // Динамический импорт
    const { getVideoUrlForPlayback } = await import("@shared/lib/video/getVideoUrlForPlayback");

    const playbackUrl = await getVideoUrlForPlayback(parsed.videoUrl);

    return NextResponse.json({
      success: true,
      data: { playbackUrl },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: error.errors[0]?.message || "Ошибка валидации",
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }
    logger.error("API: Error getting playback URL", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
