/**
 * SQL-only repository for trainer video metadata and legacy CDN linkage.
 *
 * The Core service owns publishing/authorization decisions, DTO shaping,
 * URL validation, error mapping, playback policy and cache notifications.
 * SQL projections and owner-fenced updates never leak a Prisma client to Core.
 */
import { prisma, type TranscodingStatus } from "@gafus/prisma";

export type TrainerVideoTranscodingStatus = TranscodingStatus;
export type TrainerVideoRegistration = {
  id?: string;
  trainerId: string;
  relativePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  durationSec?: number | null;
};

const trainerProjection = {
  trainer: {
    select: {
      username: true,
      profile: { select: { fullName: true } },
    },
  },
} as const;

export function createTrainerVideoRow(input: TrainerVideoRegistration) {
  const { id, fileSize, durationSec = null, ...rest } = input;
  return prisma.trainerVideo.create({
    data: {
      ...(id ? { id } : {}),
      ...rest,
      fileSize: BigInt(fileSize),
      durationSec,
    },
    include: trainerProjection,
  });
}

export async function markTrainerVideoTranscodingFailedRow(
  videoId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.trainerVideo.update({
    where: { id: videoId },
    data: {
      transcodingStatus: "FAILED",
      transcodingError: errorMessage,
    },
  });
}

export function readTrainerVideoDeleteRow(videoId: string) {
  return prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      trainerId: true,
      relativePath: true,
      hlsManifestPath: true,
      originalName: true,
    },
  });
}

function affectedStepsWhere(videoId: string, fullCdnUrl: string) {
  return { OR: [{ videoUrl: { contains: videoId } }, { videoUrl: fullCdnUrl }] };
}
export async function clearTrainerStepVideoReferences(
  videoId: string,
  fullCdnUrl: string,
): Promise<string[]> {
  const where = affectedStepsWhere(videoId, fullCdnUrl);
  const steps = await prisma.step.findMany({ where, select: { id: true } });
  await prisma.step.updateMany({ where, data: { videoUrl: null } });
  return steps.map((step) => step.id);
}
export async function clearTrainerTemplateVideoReferences(
  videoId: string,
  fullCdnUrl: string,
): Promise<void> {
  await prisma.stepTemplate.updateMany({
    where: affectedStepsWhere(videoId, fullCdnUrl),
    data: { videoUrl: null },
  });
}
export async function deleteTrainerVideoRow(videoId: string): Promise<void> {
  await prisma.trainerVideo.delete({ where: { id: videoId } });
}

export function readTrainerVideoOwnerRow(videoId: string) {
  return prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: { id: true, trainerId: true },
  });
}

/** Even if ownership changed between read and write, a foreign caller cannot rename. */
export async function renameTrainerVideoForOwner(
  videoId: string,
  trainerId: string,
  displayName: string | null,
): Promise<boolean> {
  const result = await prisma.trainerVideo.updateMany({
    where: { id: videoId, trainerId },
    data: { displayName },
  });
  return result.count === 1;
}

export function readTrainerVideosRows(trainerId: string, forAdmin: boolean) {
  return prisma.trainerVideo.findMany({
    where: forAdmin ? undefined : { trainerId },
    include: trainerProjection,
    orderBy: { createdAt: "desc" },
  });
}

export function readTrainerVideoStatusRows(videoIds: string[]) {
  return prisma.trainerVideo.findMany({
    where: { id: { in: videoIds } },
    select: {
      id: true,
      transcodingStatus: true,
      transcodingError: true,
      hlsManifestPath: true,
      thumbnailPath: true,
      durationSec: true,
    },
  });
}

export function readTrainerVideoMetadataRow(videoId: string) {
  return prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: { id: true, thumbnailPath: true, transcodingStatus: true },
  });
}
export function readTrainerVideoManifestRow(videoId: string) {
  return prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: { transcodingStatus: true, hlsManifestPath: true, thumbnailPath: true },
  });
}
export function readTrainerVideoPlaybackRow(videoId: string) {
  return prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: { transcodingStatus: true },
  });
}
