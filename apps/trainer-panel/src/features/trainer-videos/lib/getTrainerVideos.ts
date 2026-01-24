"use server";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";

import type { TrainerVideoDto } from "@gafus/types";
import type { AuthUser } from "@gafus/types";

export async function getTrainerVideos(trainerId: string): Promise<TrainerVideoDto[]> {
  const session = await getServerSession(authOptions);
  const user = session?.user as AuthUser | undefined;

  if (!user) {
    throw new Error("Unauthorized: No session or user found.");
  }

  const { role } = user;
  const isAdmin = role === "ADMIN";

  const where = isAdmin ? undefined : { trainerId };

  const videos = await prisma.trainerVideo.findMany({
    where,
    include: {
      trainer: {
        select: {
          username: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return videos.map((video) => ({
    id: video.id,
    trainerId: video.trainerId,
    relativePath: video.relativePath,
    originalName: video.originalName,
    displayName: video.displayName,
    mimeType: video.mimeType,
    fileSize: video.fileSize,
    durationSec: video.durationSec,
    hlsManifestPath: video.hlsManifestPath,
    thumbnailPath: video.thumbnailPath,
    transcodingStatus: video.transcodingStatus,
    transcodingError: video.transcodingError,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    trainer: video.trainer
      ? {
          username: video.trainer.username,
          fullName: video.trainer.profile?.fullName ?? null,
        }
      : undefined,
  }));
}
