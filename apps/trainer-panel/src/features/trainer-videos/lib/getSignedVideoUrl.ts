"use server";

import { headers } from "next/headers";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { getSignedVideoToken } from "@gafus/core/services/trainerVideo";

/**
 * Генерирует подписанный URL для HLS манифеста.
 * Токен берётся из core, URL собирается с host из запроса.
 */
export async function getSignedVideoUrl(videoId: string): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return null;
    }

    const token = getSignedVideoToken(videoId, session.user.id, 120);

    const headersList = await headers();
    const host = headersList.get("host");
    const protocol =
      headersList.get("x-forwarded-proto") ||
      (host?.includes("localhost") ? "http" : "https");

    const baseUrl =
      host
        ? `${protocol}://${host}`
        : process.env.NEXT_PUBLIC_TRAINER_PANEL_URL || "http://localhost:3001";

    return `${baseUrl}/api/video/${videoId}/manifest?token=${token}`;
  } catch {
    return null;
  }
}
