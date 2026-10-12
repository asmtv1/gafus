/**
 * Pets Service
 * Сервис для работы с питомцами
 */
import { randomUUID } from "crypto";

import { prisma } from "@gafus/prisma";
import {
  deleteFileFromCDN,
  getPetDocumentPath,
  getPetPhotoPath,
  getRelativePathFromCDNUrl,
  uploadFileToCDN,
  parsePrivateMediaLocation,
  signPrivateUserMedia,
  privateMediaEnabled,
  privateMediaLocation,
} from "@gafus/cdn-upload";
import { createWebLogger } from "@gafus/logger";
import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
  PET_DOCUMENTS_MAX_PER_PET,
  type PetDocumentAllowedMimeType,
  type PetDocumentDto,
} from "@gafus/types";

import type { PetType, Prisma } from "@gafus/prisma";
import { enqueuePetVetCleanup, lockVetPet } from "./petVetVisitService";

const logger = createWebLogger("core-pets");

const MIME_TYPE_TO_EXTENSION: Record<PetDocumentAllowedMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export interface CreatePetInput {
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
  photoUrl?: string;
  notes?: string;
}

export interface UpdatePetInput {
  showInProfile?: boolean;
  name?: string;
  type?: string;
  breed?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
  photoUrl?: string;
  notes?: string;
}

interface UploadPetDocumentInput {
  name: string;
  type: string;
  size: number;
}

interface PrismaErrorLike {
  code?: string;
  message?: string;
}

function isPetDocumentTableMissingError(error: unknown): boolean {
  const prismaError = error as PrismaErrorLike;
  return (
    prismaError?.code === "P2021" &&
    typeof prismaError.message === "string" &&
    prismaError.message.includes("PetDocument")
  );
}

function toPetDocumentDto(document: {
  id: string;
  petId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}): PetDocumentDto {
  return {
    ...document,
    mimeType: document.mimeType as PetDocumentAllowedMimeType,
  };
}

async function presentPetDocumentDto(document: PetDocumentDto): Promise<PetDocumentDto> {
  // Existing Yandex URLs remain untouched. The Cloud.ru reference stays in the DB;
  // Web and Mobile receive a one-hour signed link only after an owner-scoped lookup.
  return parsePrivateMediaLocation(document.url)
    ? { ...document, url: await signPrivateUserMedia(document.url) }
    : document;
}

function getDocumentExtension(file: UploadPetDocumentInput): string {
  // Storage paths derive from the verified MIME, never an untrusted filename suffix.
  // A misleading .txt suffix must not silently fall back to the public legacy bucket.
  const extension = MIME_TYPE_TO_EXTENSION[file.type as PetDocumentAllowedMimeType];
  if (!extension) throw new Error("Недопустимый тип документа");
  return extension;
}

function getExtensionFromFileName(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  if (!ext || ext === fileName.toLowerCase()) {
    return null;
  }
  return ext;
}

/** Макс. длина базового имени (без расширения) — защита от раздувания строки в БД и заголовках. */
const PET_DOCUMENT_BASE_NAME_MAX_LENGTH = 200;

/**
 * Убирает управляющие символы и типичные «путь/файл»-символы из базы имени файла.
 * Имя хранится только как метаданные (путь в CDN от UUID), но так безопаснее для UI и Content-Disposition.
 */
function sanitizePetDocumentFileBaseName(rawBase: string): string {
  const withoutControlChars = Array.from(rawBase)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code <= 31 || code === 127);
    })
    .join("");

  const collapsed = withoutControlChars
    .replace(/[/\\:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return collapsed.slice(0, PET_DOCUMENT_BASE_NAME_MAX_LENGTH);
}

function buildDocumentNameWithOriginalExtension(
  name: string,
  currentFileName: string,
  mimeType: string,
): string {
  const normalizedName = name.trim();
  const originalExtension =
    getExtensionFromFileName(currentFileName) ??
    MIME_TYPE_TO_EXTENSION[mimeType as PetDocumentAllowedMimeType] ??
    "bin";

  const extLower = originalExtension.toLowerCase();
  let basePart: string;

  if (normalizedName.toLowerCase().endsWith(`.${extLower}`)) {
    basePart = normalizedName.slice(0, normalizedName.length - extLower.length - 1);
  } else {
    basePart = normalizedName.replace(/\.[^./\\]+$/, "").trim();
    if (!basePart) {
      basePart = normalizedName;
    }
  }

  const safeBase = sanitizePetDocumentFileBaseName(basePart);
  if (!safeBase) {
    return `document.${originalExtension}`;
  }

  return `${safeBase}.${originalExtension}`;
}

function validatePetDocumentFile(file: UploadPetDocumentInput): void {
  if (!PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as PetDocumentAllowedMimeType)) {
    throw new Error("Недопустимый тип документа");
  }
  if (file.size > PET_DOCUMENT_MAX_SIZE_BYTES) {
    throw new Error("Размер документа превышает 10 МБ");
  }
}

/**
 * Получить список питомцев пользователя
 */
export async function getUserPets(userId: string) {
  try {
    const pets = await prisma.pet.findMany({
      where: { ownerId: userId },
      include: {
        awards: {
          orderBy: { date: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return pets;
  } catch (error) {
    logger.error("Ошибка при получении питомцев", error as Error);
    return [];
  }
}

/**
 * Получить питомца по ID
 */
export async function getPetById(petId: string, userId: string) {
  const pet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
    include: {
      awards: {
        orderBy: { date: "desc" },
      },
    },
  });

  return pet;
}

/**
 * Создать питомца
 */
export async function createPet(userId: string, data: CreatePetInput) {
  try {
    const pet = await prisma.pet.create({
      data: {
        ownerId: userId,
        name: data.name,
        type: data.type as PetType,
        breed: data.breed,
        birthDate: new Date(data.birthDate),
        heightCm: data.heightCm ?? null,
        weightKg: null,
        neckGirthCm: data.neckGirthCm ?? null,
        muzzleGirthCm: data.muzzleGirthCm ?? null,
        bellyGirthCm: data.bellyGirthCm ?? null,
        photoUrl: data.photoUrl || null,
        notes: data.notes ?? null,
      },
      include: {
        awards: true,
      },
    });

    return pet;
  } catch (error) {
    logger.error("Ошибка при создании питомца", error as Error);
    throw new Error("Не удалось создать питомца");
  }
}

/**
 * Обновить питомца
 */
export async function updatePet(petId: string, userId: string, data: UpdatePetInput) {
  // Проверяем, что питомец принадлежит пользователю
  const existingPet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
  });

  if (!existingPet) {
    return null;
  }

  const updateData: Prisma.PetUpdateInput = {};

  if (data.showInProfile !== undefined) updateData.showInProfile = data.showInProfile;

  if (data.name !== undefined) updateData.name = data.name;
  if (data.type !== undefined) updateData.type = data.type as PetType;
  if (data.breed !== undefined) updateData.breed = data.breed;
  if (data.birthDate !== undefined) updateData.birthDate = new Date(data.birthDate);
  if (data.heightCm !== undefined) updateData.heightCm = data.heightCm ?? null;
  if (data.neckGirthCm !== undefined) updateData.neckGirthCm = data.neckGirthCm ?? null;
  if (data.muzzleGirthCm !== undefined) updateData.muzzleGirthCm = data.muzzleGirthCm ?? null;
  if (data.bellyGirthCm !== undefined) updateData.bellyGirthCm = data.bellyGirthCm ?? null;
  if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl || null;
  if (data.notes !== undefined) updateData.notes = data.notes ?? null;

  try {
    const pet = await prisma.$transaction(async (tx) => {
      const updated = await tx.pet.update({
        where: { id: petId, ownerId: userId },
        data: updateData,
        include: { awards: true },
      });
      return updated;
    });

    return pet;
  } catch (error) {
    logger.error("Ошибка при обновлении питомца", error as Error);
    throw new Error("Не удалось обновить питомца");
  }
}

/**
 * Обновить фото питомца (загрузка в CDN и сохранение URL в БД)
 */
export async function updatePetPhoto(petId: string, userId: string, file: File): Promise<string> {
  return prisma.$transaction(
    async (tx) => {
      const owners = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!owners.length) throw new Error("Пользователь не найден");
      const existingPet = await tx.pet.findFirst({
        where: { id: petId, ownerId: userId },
        select: { photoUrl: true },
      });

      if (!existingPet) {
        throw new Error("Питомец не найден или не принадлежит пользователю");
      }

      const ext = file.name.split(".").pop();
      if (!ext) throw new Error("Не удалось определить расширение файла");

      const uuid = randomUUID();
      const relativePath = getPetPhotoPath(userId, petId, uuid, ext);
      const photoUrl = await uploadFileToCDN(file, relativePath);

      if (existingPet.photoUrl) {
        try {
          const oldRelativePath = getRelativePathFromCDNUrl(existingPet.photoUrl);
          await deleteFileFromCDN(oldRelativePath);
          logger.info(`Старое фото питомца удалено из CDN: ${oldRelativePath}`);
        } catch (error) {
          logger.error("Не удалось удалить старое фото питомца", error as Error);
        }
      }

      await tx.pet.update({
        where: { id: petId },
        data: { photoUrl },
      });

      logger.info("Photo URL saved to database", { photoUrl, petId });
      return photoUrl;
    },
    { timeout: 90_000 },
  );
}

/**
 * Получить документы питомца
 */
export async function listPetDocuments(petId: string, userId: string): Promise<PetDocumentDto[]> {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
    select: { id: true },
  });
  if (!pet) {
    throw new Error("Питомец не найден");
  }

  const documents = await prisma.petDocument.findMany({
    where: { petId, ownerId: userId },
    orderBy: [{ createdAt: "desc" }],
  });
  return Promise.all(documents.map((doc) => presentPetDocumentDto(toPetDocumentDto(doc))));
}

/**
 * Получить все документы питомцев пользователя
 */
export async function listUserPetDocuments(userId: string): Promise<PetDocumentDto[]> {
  try {
    const documents = await prisma.petDocument.findMany({
      where: { ownerId: userId },
      orderBy: [{ createdAt: "desc" }],
    });
    return Promise.all(documents.map((doc) => presentPetDocumentDto(toPetDocumentDto(doc))));
  } catch (error) {
    if (isPetDocumentTableMissingError(error)) {
      logger.warn("Таблица документов питомцев отсутствует, возвращаем пустой список", {
        userId,
      });
      return [];
    }
    throw error;
  }
}

/**
 * Загрузить документ питомца
 */
export async function uploadPetDocument(
  petId: string,
  userId: string,
  file: File,
): Promise<PetDocumentDto> {
  validatePetDocumentFile(file);
  // Never upload to a provider for an unauthenticated or foreign pet. The same
  // permission and quota are rechecked inside a short serializable owner lock.
  const authorizedPet = await prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
    select: { id: true },
  });
  if (!authorizedPet) throw new Error("Питомец не найден");

  const ext = getDocumentExtension(file);
  const relativePath = getPetDocumentPath(userId, petId, randomUUID(), ext);
  // A provider-qualified reservation is computable before S3 I/O. If a PUT
  // succeeds but the network times out, compensation can still find the UUID.
  const attempted = privateMediaEnabled()
    ? privateMediaLocation("documents", relativePath)
    : relativePath;
  let uploadedUrl: string | undefined;
  try {
    uploadedUrl = await uploadFileToCDN(file, relativePath);
    const result = await prisma.$transaction(
      async (tx) => {
        const owners = await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        if (!owners.length) throw new Error("Пользователь не найден");
        const pet = await tx.pet.findFirst({
          where: { id: petId, ownerId: userId },
          select: { id: true },
        });
        if (!pet) throw new Error("Питомец не найден");
        const documentsCount = await tx.petDocument.count({
          where: { petId, ownerId: userId },
        });
        if (documentsCount >= PET_DOCUMENTS_MAX_PER_PET)
          throw new Error("Достигнут лимит документов питомца");
        return tx.petDocument.create({
          data: {
            petId,
            ownerId: userId,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            url: uploadedUrl!,
          },
        });
      },
      { timeout: 10_000 },
    );
    // Signing is not a part of the DB transaction: transient S3 signing failures
    // cannot roll back an otherwise committed private document.
    return await presentPetDocumentDto(toPetDocumentDto(result));
  } catch (error) {
    // The computed UUID is safe to check even when an S3 PUT timed out without
    // returning a marker. A transient DB failure must never delete committed data.
    const candidate = uploadedUrl ?? attempted;
    try {
      const committed = await prisma.petDocument.findFirst({
        where: { url: candidate, petId, ownerId: userId },
        select: { id: true },
      });
      if (!committed) await deleteFileFromCDN(getRelativePathFromCDNUrl(candidate));
    } catch (cleanupError) {
      logger.error("Не удалось компенсировать загрузку документа", cleanupError as Error, {
        petId,
        userId,
      });
    }
    logger.error("Ошибка при загрузке документа питомца", error as Error, { petId, userId });
    throw error;
  }
}

/**
 * Удалить документ питомца
 */
export async function deletePetDocument(
  documentId: string,
  userId: string,
  petId?: string,
): Promise<boolean> {
  const existingDocument = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
  });
  if (!existingDocument) {
    return false;
  }

  try {
    const relativePath = getRelativePathFromCDNUrl(existingDocument.url);
    await deleteFileFromCDN(relativePath);
  } catch (error) {
    logger.error("Не удалось удалить документ питомца из CDN", error as Error, {
      documentId,
      userId,
    });
    // A private Cloud.ru object must not be orphaned by deleting its DB locator.
    if (parsePrivateMediaLocation(existingDocument.url)) throw error;
  }

  await prisma.petDocument.delete({
    where: { id: documentId },
  });
  return true;
}

/**
 * Обновить название документа питомца
 */
export async function renamePetDocument(
  documentId: string,
  userId: string,
  name: string,
  petId?: string,
): Promise<PetDocumentDto | null> {
  const nextName = name.trim();
  if (!nextName) {
    throw new Error("Название документа не может быть пустым");
  }

  const existingDocument = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
  });
  if (!existingDocument) {
    return null;
  }

  const nextFileName = buildDocumentNameWithOriginalExtension(
    nextName,
    existingDocument.name,
    existingDocument.mimeType,
  );

  const updatedDocument = await prisma.petDocument.update({
    where: { id: documentId },
    data: { name: nextFileName },
  });
  return presentPetDocumentDto(toPetDocumentDto(updatedDocument));
}

/**
 * Получить документ питомца для скачивания
 */
export async function getPetDocumentById(
  documentId: string,
  userId: string,
  petId?: string,
): Promise<PetDocumentDto | null> {
  const document = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
  });
  if (!document) {
    return null;
  }
  return presentPetDocumentDto(toPetDocumentDto(document));
}

export interface PetDocumentDownloadPayload {
  documentId: string;
  fileName: string;
  mimeType: PetDocumentAllowedMimeType;
  sizeBytes: number;
  downloadUrl: string;
}

/**
 * Подготовить данные документа питомца для скачивания
 */
export async function preparePetDocumentDownload(
  documentId: string,
  userId: string,
  petId?: string,
): Promise<PetDocumentDownloadPayload | null> {
  const document = await prisma.petDocument.findFirst({
    where: { id: documentId, ownerId: userId, ...(petId ? { petId } : {}) },
    select: {
      id: true,
      name: true,
      mimeType: true,
      sizeBytes: true,
      url: true,
    },
  });
  if (!document) {
    return null;
  }

  return {
    documentId: document.id,
    fileName: document.name,
    mimeType: document.mimeType as PetDocumentAllowedMimeType,
    sizeBytes: document.sizeBytes,
    // Owner check above precedes this short-lived direct private-bucket URL.
    downloadUrl: parsePrivateMediaLocation(document.url)
      ? await signPrivateUserMedia(document.url, 120, document.name)
      : document.url,
  };
}

/**
 * Удалить питомца
 */
export async function deletePet(petId: string, userId: string): Promise<boolean> {
  // Проверяем, что питомец принадлежит пользователю
  const existingPet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
    select: { photoUrl: true },
  });

  if (!existingPet) {
    return false;
  }

  const petDocuments = await prisma.petDocument.findMany({
    where: { petId, ownerId: userId },
    select: { id: true, url: true },
  });

  // Удаляем фото из CDN, если есть
  if (existingPet.photoUrl) {
    try {
      const relativePath = getRelativePathFromCDNUrl(existingPet.photoUrl);
      await deleteFileFromCDN(relativePath);
      logger.info(`Photo deleted from CDN: ${relativePath}`);
    } catch (error) {
      logger.error("Failed to delete photo from CDN", error as Error);
      // Продолжаем удаление питомца даже если фото не удалилось
    }
  }

  if (petDocuments.length > 0) {
    await Promise.all(
      petDocuments.map(async (document) => {
        try {
          const relativePath = getRelativePathFromCDNUrl(document.url);
          await deleteFileFromCDN(relativePath);
        } catch (error) {
          logger.error("Не удалось удалить документ питомца из CDN", error as Error, {
            documentId: document.id,
            petId,
            userId,
          });
          if (parsePrivateMediaLocation(document.url)) throw error;
        }
      }),
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await lockVetPet(tx, petId, userId);
      await enqueuePetVetCleanup(tx, petId, userId);
      await tx.pet.delete({ where: { id: petId } });
    });
    return true;
  } catch (error) {
    logger.error("Ошибка при удалении питомца", error as Error);
    throw new Error("Не удалось удалить питомца");
  }
}
