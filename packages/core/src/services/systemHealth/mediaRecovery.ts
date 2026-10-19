/** Durable read-only Core inspection for Cloud.ru media recovery.
 * Keep Prisma access in Core; Worker owns dispatch and rate limiting only.
 * IDs never enter telemetry or Cloud.ru execution request bodies.
 */
import { prisma } from "@gafus/prisma";

export type DurableMediaRecoveryKind = "gallery" | "feed-photo" | "feed-video";
export interface DurableMediaRecoverySnapshot { dueIds: string[]; active: number }
const PHOTO_KINDS = ["copy_album", "publish_photo", "delete_keys", "cleanup_source"] as const;

export async function inspectCoreDueMediaWork(
  kind: DurableMediaRecoveryKind, at = new Date(), minimumAgeMs = 45_000,
): Promise<DurableMediaRecoverySnapshot> {
  const olderThan = new Date(at.getTime() - minimumAgeMs);
  const dueJob = { OR: [
    { status: "pending" as const, availableAt: { lte: at } },
    { status: "processing" as const, leaseUntil: { lt: at } },
  ] };
  if (kind === "gallery") {
    const [jobs, uploads, activeJobs, activeUploads] = await Promise.all([
      prisma.galleryStorageJob.findMany({
        where: { ...dueJob, createdAt: { lte: olderThan } },
        select: { id: true }, orderBy: { availableAt: "asc" }, take: 100,
      }),
      prisma.galleryUpload.findMany({
        where: { updatedAt: { lte: olderThan }, OR: [
          { status: "uploaded", nextAttemptAt: { lte: at } },
          { status: "processing", leaseUntil: { lte: at } },
          { status: { in: ["reserved", "uploaded", "processing"] },
            reservationExpiresAt: { lte: at } },
        ] },
        select: { id: true }, orderBy: { nextAttemptAt: "asc" }, take: 100,
      }),
      prisma.galleryStorageJob.count({
        where: { status: "processing", leaseUntil: { gt: at } },
      }),
      prisma.galleryUpload.count({
        where: { status: "processing", leaseUntil: { gt: at } },
      }),
    ]);
    return {
      dueIds: [...jobs.map(row => "job:" + row.id), ...uploads.map(row => "upload:" + row.id)],
      active: activeJobs + activeUploads,
    };
  }
  const kinds = kind === "feed-video" ? "publish_video" : { in: [...PHOTO_KINDS] };
  const [jobs, active] = await Promise.all([
    prisma.feedStorageJob.findMany({
      where: { ...dueJob, createdAt: { lte: olderThan }, kind: kinds },
      orderBy: { availableAt: "asc" }, select: { id: true },
      take: kind === "feed-photo" ? 20 : 8,
    }),
    prisma.feedStorageJob.count({
      where: { kind: kinds, status: "processing", leaseUntil: { gt: at } },
    }),
  ]);
  return { dueIds: jobs.map(row => row.id), active };
}
