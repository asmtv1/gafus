import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { prisma, type Prisma } from "@gafus/prisma";
import { uploadVetVisitFile, vetVisitFileKeys, vetVisitMediaUrl } from "@gafus/cdn-upload";
import {
  VET_VISIT_MAX_ATTACHMENTS,
  VET_VISIT_MAX_FILE_BYTES,
  VET_VISIT_MIME_TYPES,
  type PetVetVisit,
} from "@gafus/types";
import { enqueueDelete } from "../gallery/persistence";

export class VetVisitError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 | 413 = 400,
  ) {
    super(message);
  }
}
const text = (max: number) =>
  z.string().trim().max(max, `Допустимо не более ${max} символов`).default("");
export const petVetVisitSchema = z.object({
  visitedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату посещения")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value &&
        value >= "1900-01-01" &&
        date.getTime() <= Date.now() + 14 * 60 * 60 * 1000
      );
    }, "Проверьте дату посещения"),
  specialty: z
    .string()
    .trim()
    .min(1, "Укажите специальность врача")
    .max(200, "Специальность: не более 200 символов"),
  doctorName: text(200),
  clinic: text(300),
  diagnosis: text(10_000),
  conclusion: text(10_000),
  notes: text(10_000),
});
type VisitRow = Prisma.PetVetVisitGetPayload<{ include: { attachments: true } }>;
const include = { attachments: { orderBy: { createdAt: "asc" as const } } };
function dto(row: VisitRow, pending = new Set<string>()): PetVetVisit {
  return {
    id: row.id,
    petId: row.petId,
    visitedOn: row.visitedOn.toISOString().slice(0, 10),
    specialty: row.specialty,
    doctorName: row.doctorName,
    clinic: row.clinic,
    diagnosis: row.diagnosis,
    conclusion: row.conclusion,
    notes: row.notes,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      hasPreview: !!a.previewKey,
      previewProcessing: !a.previewKey && pending.has(`vet-preview:${a.id}`),
    })),
  };
}
async function petOwner(petId: string, ownerId: string) {
  if (!(await prisma.pet.findFirst({ where: { id: petId, ownerId }, select: { id: true } })))
    throw new VetVisitError("Питомец не найден", 404);
}
export async function lockVetPet(tx: Prisma.TransactionClient, petId: string, ownerId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
  const pets = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Pet" WHERE "id" = ${petId} AND "ownerId" = ${ownerId} FOR UPDATE`;
  if (!pets.length) throw new VetVisitError("Питомец не найден", 404);
}
async function lockVisit(tx: Prisma.TransactionClient, petId: string, ownerId: string, id: string) {
  await lockVetPet(tx, petId, ownerId);
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT v."id" FROM "PetVetVisit" v JOIN "Pet" p ON p."id" = v."petId" AND p."ownerId" = v."ownerId" WHERE v."id" = ${id} AND v."petId" = ${petId} AND v."ownerId" = ${ownerId} FOR UPDATE OF v`;
  if (!rows.length) throw new VetVisitError("Посещение не найдено", 404);
}
export async function listPetVetVisits(petId: string, ownerId: string) {
  await petOwner(petId, ownerId);
  const rows = await prisma.petVetVisit.findMany({
    where: { petId, ownerId },
    include,
    orderBy: [{ visitedOn: "desc" }, { createdAt: "desc" }],
  });
  const candidates = rows.flatMap((row) =>
    row.attachments
      .filter((a) => !a.previewKey && a.mimeType.startsWith("image/"))
      .map((a) => `vet-preview:${a.id}`),
  );
  const active = candidates.length
    ? await prisma.galleryStorageJob.findMany({
        where: { dedupeKey: { in: candidates }, status: { in: ["pending", "processing"] } },
        select: { dedupeKey: true },
      })
    : [];
  const pending = new Set(active.map((job) => job.dedupeKey));
  return rows.map((row) => dto(row, pending));
}
export async function savePetVetVisit(petId: string, ownerId: string, input: unknown, id?: string) {
  const parsed = petVetVisitSchema.parse(input);
  const data = { ...parsed, visitedOn: new Date(`${parsed.visitedOn}T00:00:00Z`) };
  return prisma.$transaction(async (tx) => {
    if (id) {
      await lockVisit(tx, petId, ownerId, id);
      return dto(await tx.petVetVisit.update({ where: { id }, data, include }));
    }
    await lockVetPet(tx, petId, ownerId);
    return dto(await tx.petVetVisit.create({ data: { ...data, petId, ownerId }, include }));
  });
}
export async function deletePetVetVisit(petId: string, ownerId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    await lockVisit(tx, petId, ownerId, id);
    const attachments = await tx.petVetAttachment.findMany({ where: { visitId: id } });
    await enqueueDelete(
      tx,
      ownerId,
      attachments.flatMap((a) => [a.originalKey, a.previewKey]),
      new Date(),
      `vet-visit:${id}`,
    );
    await tx.petVetVisit.delete({ where: { id } });
  });
}
export async function addPetVetAttachment(
  petId: string,
  ownerId: string,
  visitId: string,
  file: File,
) {
  if (
    !(await prisma.petVetVisit.findFirst({
      where: { id: visitId, petId, ownerId },
      select: { id: true },
    }))
  )
    throw new VetVisitError("Посещение не найдено", 404);
  if (!file.size || file.size > VET_VISIT_MAX_FILE_BYTES)
    throw new VetVisitError("Размер файла должен быть от 1 байта до 10 МБ", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  if (
    !detected ||
    !VET_VISIT_MIME_TYPES.includes(detected.mime as (typeof VET_VISIT_MIME_TYPES)[number])
  )
    throw new VetVisitError("Разрешены фотографии JPEG, PNG, WebP и документы PDF");
  const id = randomUUID();
  const keys = vetVisitFileKeys(ownerId, petId, visitId, id, detected.mime);
  // Gradual rollout: legacy synchronous processing stays the default until the
  // Gallery cloud worker and its durable callback path are deployed together.
  const asyncFlag = process.env.VET_PREVIEW_ASYNC_ENABLED;
  if (asyncFlag && !["true", "false"].includes(asyncFlag))
    throw new VetVisitError("Некорректная конфигурация предпросмотра", 409);
  const asyncPreview = asyncFlag === "true" && !!keys.previewKey;
  const originalETag = `"${createHash("md5").update(bytes).digest("hex")}"`;
  const dedupeKey = `vet-upload:${id}`;
  // Durable cleanup is reserved BEFORE storage I/O. It survives crashes, partial uploads and owner deletion.
  await prisma.$transaction(async (tx) => {
    await lockVisit(tx, petId, ownerId, visitId);
    if ((await tx.petVetAttachment.count({ where: { visitId } })) >= VET_VISIT_MAX_ATTACHMENTS)
      throw new VetVisitError("На одно посещение можно добавить до 5 вложений", 409);
    await enqueueDelete(
      tx,
      ownerId,
      [keys.originalKey, keys.previewKey],
      new Date(Date.now() + 10 * 60_000),
      dedupeKey,
    );
  });
  await uploadVetVisitFile(bytes, detected.mime, keys, { asyncPreview });
  const rawName = file.name
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127 && char !== "/" && char !== "\\";
    })
    .join("")
    .trim()
    .slice(0, 200);
  await prisma.$transaction(async (tx) => {
    await lockVisit(tx, petId, ownerId, visitId);
    if ((await tx.petVetAttachment.count({ where: { visitId } })) >= VET_VISIT_MAX_ATTACHMENTS)
      throw new VetVisitError("На одно посещение можно добавить до 5 вложений", 409);
    const removed = await tx.galleryStorageJob.deleteMany({
      where: { dedupeKey, status: "pending", availableAt: { gt: new Date() } },
    });
    if (removed.count !== 1)
      throw new VetVisitError("Загрузка заняла слишком много времени. Повторите попытку", 409);
    await tx.petVetAttachment.create({
      data: {
        id,
        visitId,
        ...keys,
        previewKey: asyncPreview ? null : keys.previewKey,
        name: rawName || `Медкарта.${detected.ext}`,
        mimeType: detected.mime,
        sizeBytes: bytes.byteLength,
      },
    });
    if (asyncPreview && keys.previewKey) {
      // The preview is invisible until Gallery core verifies the worker's
      // finished object and atomically commits previewKey. No polling in API.
      await tx.galleryStorageJob.create({
        data: {
          id: randomUUID(),
          dedupeKey: `vet-preview:${id}`,
          kind: "vetPreview",
          ownerId,
          sourceKeys: [keys.originalKey],
          sourceETags: [originalETag],
          targetKeys: [keys.previewKey],
          availableAt: new Date(),
        },
      });
    }
  });
  return { id };
}
export async function deletePetVetAttachment(
  petId: string,
  ownerId: string,
  visitId: string,
  id: string,
) {
  await prisma.$transaction(async (tx) => {
    await lockVisit(tx, petId, ownerId, visitId);
    const attachment = await tx.petVetAttachment.findFirst({ where: { id, visitId } });
    if (!attachment) throw new VetVisitError("Вложение не найдено", 404);
    await enqueueDelete(
      tx,
      ownerId,
      [attachment.originalKey, attachment.previewKey],
      new Date(),
      `vet-attachment:${id}`,
    );
    await tx.petVetAttachment.delete({ where: { id } });
  });
}
export async function getPetVetMedia(
  petId: string,
  ownerId: string,
  visitId: string,
  id: string,
  variant: string,
) {
  const attachment = await prisma.petVetAttachment.findFirst({
    where: { id, visitId, visit: { petId, ownerId } },
  });
  if (!attachment) throw new VetVisitError("Вложение не найдено", 404);
  if (!["preview", "original", "download"].includes(variant))
    throw new VetVisitError("Неизвестный вид вложения");
  if (variant === "preview" && !attachment.previewKey)
    throw new VetVisitError("Предпросмотр недоступен", 404);
  return {
    url: await vetVisitMediaUrl(
      variant === "preview" ? attachment.previewKey! : attachment.originalKey,
      variant === "download" ? attachment.name : undefined,
    ),
  };
}

export async function enqueuePetVetCleanup(
  tx: Prisma.TransactionClient,
  petId: string,
  ownerId: string,
) {
  const rows = await tx.petVetAttachment.findMany({ where: { visit: { petId, ownerId } } });
  for (const attachment of rows)
    await enqueueDelete(
      tx,
      ownerId,
      [attachment.originalKey, attachment.previewKey],
      new Date(),
      `vet-pet:${petId}:${attachment.id}`,
    );
}
