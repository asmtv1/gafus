import { prisma } from "@gafus/prisma";

import type { TrainerVideoDto } from "@gafus/types";

export async function getTrainerVideos(trainerId: string): Promise<TrainerVideoDto[]> {
  return prisma.trainerVideo.findMany({
    where: { trainerId },
    orderBy: { createdAt: "desc" },
  });
}

