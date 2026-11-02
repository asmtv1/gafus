import { prisma } from "@gafus/prisma";
import type { GalleryDb } from "./ports";

/** Durable database predicate for scheduled Cloud.ru Gallery wake-ups.
 * Core owns the Gallery Prisma model and its recovery eligibility contract.
 * One accepted launch is sufficient: Cloud Jobs claim bounded PG batches. */
export async function hasDueGalleryCloudWork(
  database: Pick<GalleryDb, "galleryUpload" | "galleryStorageJob"> = prisma,
  at: Date = new Date(),
): Promise<boolean> {
  const uploads = await database.galleryUpload.count({ where: { OR: [
    { status: { in: ["reserved", "uploaded"] },
      nextAttemptAt: { lte: at }, reservationExpiresAt: { gt: at } },
    { status: "processing", leaseUntil: { lte: at } },
    { status: { in: ["reserved", "uploaded", "processing"] },
      reservationExpiresAt: { lte: at } },
  ] } });
  if (uploads) return true;
  const cleanupCutoff = new Date(at.getTime() - 60 * 60 * 1000);
  const storage = await database.galleryStorageJob.count({ where: { OR: [
    { status: "pending", availableAt: { lte: at } },
    { status: "processing", leaseUntil: { lte: at } },
    { kind: "delete", status: "failed", updatedAt: { lte: cleanupCutoff } },
  ] } });
  return storage > 0;
}
