import { prisma } from "@gafus/prisma";

/** Read-only, least-privilege metadata projection. Admin sees all videos;
 * trainers can only enumerate their own. API validates every returned field
 * before serializing; paths, errors and provider credentials are never read.
 */
export function readTrainerVideoMetadataRows(actor: { id: string; role: "TRAINER" | "ADMIN" }) {
  return prisma.trainerVideo.findMany({
    where: actor.role === "ADMIN" ? undefined : { trainerId: actor.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, displayName: true, transcodingStatus: true,
      durationSec: true, createdAt: true,
    },
  });
}
