"use server";

import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getVideoAccessService } from "@gafus/video-access";

/**
 * Генерирует подписанный URL для HLS манифеста
 * @param videoId - ID видео
 * @returns Подписанный URL или null если нет доступа
 */
export async function getSignedVideoUrl(videoId: string): Promise<string | null> {
  console.log("[getSignedVideoUrl] === НАЧАЛО ===", { videoId });
  
  try {
    const session = await getServerSession(authOptions);
    console.log("[getSignedVideoUrl] Сессия:", { 
      hasSession: !!session, 
      userId: session?.user?.id,
      userRole: session?.user?.role,
    });

    if (!session?.user?.id) {
      console.error("[getSignedVideoUrl] Нет сессии пользователя");
      return null;
    }

    console.log("[getSignedVideoUrl] Получаем videoAccessService...");
    const videoAccessService = getVideoAccessService();
    
    // Генерируем токен на 2 часа (достаточно для просмотра видео)
    console.log("[getSignedVideoUrl] Генерируем токен...", { videoId, userId: session.user.id });
    const token = videoAccessService.generateToken({
      videoId,
      userId: session.user.id,
      ttlMinutes: 120,
    });
    console.log("[getSignedVideoUrl] Токен сгенерирован:", token ? "есть" : "null");

    // Получаем host из заголовков запроса для формирования правильного URL
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = headersList.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    
    console.log("[getSignedVideoUrl] Заголовки:", { host, protocol });
    
    // Формируем URL к API эндпоинту манифеста
    // Используем host из запроса, если доступен, иначе fallback на env переменную
    const baseUrl = host 
      ? `${protocol}://${host}`
      : (process.env.NEXT_PUBLIC_TRAINER_PANEL_URL || "http://localhost:3001");
    
    console.log("[getSignedVideoUrl] Base URL:", baseUrl);
    
    const signedUrl = `${baseUrl}/api/video/${videoId}/manifest?token=${token}`;
    console.log("[getSignedVideoUrl] === УСПЕХ ===", { signedUrl: signedUrl.substring(0, 100) + "..." });
    return signedUrl;
  } catch (error) {
    console.error("[getSignedVideoUrl] ОШИБКА при генерации signed URL:", error, {
      videoId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}
