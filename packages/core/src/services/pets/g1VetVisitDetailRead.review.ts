/** AG1 source-only single vet visit GET; no writes/PII error logs. */
import { prisma } from "@gafus/prisma";
import type { PetVetVisit } from "@gafus/types";
export class VetVisitDetailNotFoundError extends Error {
  readonly status = 404;
  readonly code = "VET_VISIT_NOT_FOUND";
  constructor() { super("Посещение не найдено"); }
}

export async function getOwnVetVisitDetail(
  ownerId: string, petId: string, visitId: string,
): Promise<PetVetVisit> {
  // Reject malformed route identifiers before a Prisma query on either HTTP platform.
  const id = /^[A-Za-z0-9_-]{1,128}$/;
  if (!id.test(petId) || !id.test(visitId)) throw new VetVisitDetailNotFoundError();
  const pet = await prisma.pet.findFirst({ where: { id: petId, ownerId }, select: { id: true } });
  if (!pet) throw new VetVisitDetailNotFoundError();
  const visit = await prisma.petVetVisit.findFirst({
    where: { id: visitId, petId, ownerId },
    include: { attachments: { orderBy: { createdAt: "asc" } } },
  });
  if (!visit) throw new VetVisitDetailNotFoundError();
  const keys = visit.attachments.filter((v) =>
    !v.previewKey && v.mimeType.startsWith("image/")).map(v => `vet-preview:${v.id}`);
  const pending = keys.length ? await prisma.galleryStorageJob.findMany({
    where: { dedupeKey: { in: keys }, status: { in: ["pending", "processing"] } },
    select: { dedupeKey: true },
  }) : [];
  const pendingKeys = new Set(pending.map(v => v.dedupeKey));
  return {
    id: visit.id, petId: visit.petId, visitedOn: visit.visitedOn.toISOString().slice(0, 10),
    specialty: visit.specialty, doctorName: visit.doctorName, clinic: visit.clinic,
    diagnosis: visit.diagnosis, conclusion: visit.conclusion, notes: visit.notes,
    attachments: visit.attachments.map(v => ({
      id: v.id, name: v.name, mimeType: v.mimeType, sizeBytes: v.sizeBytes,
      hasPreview: !!v.previewKey,
      previewProcessing: !v.previewKey && pendingKeys.has(`vet-preview:${v.id}`),
    })),
  };
}
