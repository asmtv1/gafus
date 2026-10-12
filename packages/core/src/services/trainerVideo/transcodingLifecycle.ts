import { prisma } from "@gafus/prisma";

/** Video state transitions live in core; worker handles ffmpeg, CDN and BullMQ only. */
export async function startTrainerVideoTranscoding(videoId: string): Promise<void> {
  await prisma.trainerVideo.update({
    where: { id: videoId },
    data: { transcodingStatus: "PROCESSING", transcodingError: null },
  });
}

export async function completeTrainerVideoTranscoding(input: {
  videoId: string;
  hlsManifestPath: string;
  thumbnailPath: string | null;
  durationSec: number;
  hlsTotalSize: number;
  completedAt: Date;
}): Promise<void> {
  await prisma.trainerVideo.update({
    where: { id: input.videoId },
    data: {
      hlsManifestPath: input.hlsManifestPath,
      thumbnailPath: input.thumbnailPath,
      transcodingStatus: "COMPLETED",
      transcodedAt: input.completedAt,
      transcodingError: null,
      durationSec: Math.round(input.durationSec),
      fileSize: BigInt(input.hlsTotalSize),
    },
  });
}

export async function failTrainerVideoTranscoding(videoId: string, reason: string): Promise<void> {
  await prisma.trainerVideo.update({
    where: { id: videoId },
    data: { transcodingStatus: "FAILED", transcodingError: reason },
  });
}
