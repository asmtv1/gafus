import { prisma } from "@gafus/prisma";

import type { TrainerVideoDto } from "@gafus/types";

interface RegisterTrainerVideoInput {
  id?: string;
  trainerId: string;
  relativePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  durationSec?: number | null;
}

export async function registerTrainerVideo(
  input: RegisterTrainerVideoInput,
): Promise<TrainerVideoDto> {
  const { id, durationSec = null, ...rest } = input;

  return prisma.trainerVideo.create({
    data: {
      ...(id ? { id } : {}),
      ...rest,
      durationSec,
    },
  });
}
