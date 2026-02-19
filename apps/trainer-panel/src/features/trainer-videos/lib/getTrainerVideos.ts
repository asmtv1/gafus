"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { getTrainerVideos as getTrainerVideosCore } from "@gafus/core/services/trainerVideo";

import type { TrainerVideoDto } from "@gafus/types";
import type { AuthUser } from "@gafus/types";

/**
 * Возвращает список видео тренера. Для ADMIN — все видео, для тренера — только свои.
 * Делегирует в core.
 */
export async function getTrainerVideos(
  trainerId: string,
): Promise<TrainerVideoDto[]> {
  const session = await getServerSession(authOptions);
  const user = session?.user as AuthUser | undefined;

  if (!user) {
    throw new Error("Unauthorized: No session or user found.");
  }

  const forAdmin = user.role === "ADMIN";
  return getTrainerVideosCore(trainerId, { forAdmin });
}
