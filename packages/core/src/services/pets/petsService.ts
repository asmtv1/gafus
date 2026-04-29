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
  photoUrl?: string;
  notes?: string;
}

export interface UpdatePetInput {
  name?: string;
  type?: string;
  breed?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
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

function getDocumentExtension(file: UploadPetDocumentInput): string {
  const fromFileName = file.name.split(".").pop()?.toLowerCase();
  if (fromFileName && fromFileName.length <= 8) {
    return fromFileName;
  }
  const knownMimeType = file.type as PetDocumentAllowedMimeType;
  return MIME_TYPE_TO_EXTENSION[knownMimeType] ?? "bin";
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
        weightKg: data.weightKg ?? null,
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

  if (data.name !== undefined) updateData.name = data.name;
  if (data.type !== undefined) updateData.type = data.type as PetType;
  if (data.breed !== undefined) updateData.breed = data.breed;
  if (data.birthDate !== undefined) updateData.birthDate = new Date(data.birthDate);
  if (data.heightCm !== undefined) updateData.heightCm = data.heightCm ?? null;
  if (data.weightKg !== undefined) updateData.weightKg = data.weightKg ?? null;
  if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl || null;
  if (data.notes !== undefined) updateData.notes = data.notes ?? null;

  try {
    const pet = await prisma.pet.update({
      where: { id: petId },
      data: updateData,
      include: {
        awards: true,
      },
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
export async function updatePetPhoto(
  petId: string,
  userId: string,
  file: File,
): Promise<string> {
  const existingPet = await prisma.pet.findFirst({
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

  await prisma.pet.update({
    where: { id: petId },
    data: { photoUrl },
  });

  logger.info("Photo URL saved to database", { photoUrl, petId });
  return photoUrl;
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
  return documents.map(toPetDocumentDto);
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
    return documents.map(toPetDocumentDto);
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
  const pet = await prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
    select: { id: true },
  });
  if (!pet) {
    throw new Error("Питомец не найден");
  }

  validatePetDocumentFile(file);

  const documentsCount = await prisma.petDocument.count({
    where: { petId, ownerId: userId },
  });
  if (documentsCount >= PET_DOCUMENTS_MAX_PER_PET) {
    throw new Error("Достигнут лимит документов питомца");
  }

  const ext = getDocumentExtension(file);
  const relativePath = getPetDocumentPath(userId, petId, randomUUID(), ext);
  const url = await uploadFileToCDN(file, relativePath);

  try {
    const createdDocument = await prisma.petDocument.create({
      data: {
        petId,
        ownerId: userId,
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        url,
      },
    });
    return toPetDocumentDto(createdDocument);
  } catch (error) {
    try {
      await deleteFileFromCDN(relativePath);
    } catch (cdnError) {
      logger.error("Не удалось удалить документ после ошибки БД", cdnError as Error, {
        petId,
        userId,
      });
    }
    logger.error("Ошибка при сохранении документа питомца", error as Error, { petId, userId });
    throw new Error("Не удалось сохранить документ питомца");
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
  }

  await prisma.petDocument.delete({
    where: { id: documentId },
  });
  return true;
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
        }
      }),
    );
  }

  try {
    await prisma.pet.delete({
      where: { id: petId },
    });
    return true;
  } catch (error) {
    logger.error("Ошибка при удалении питомца", error as Error);
    throw new Error("Не удалось удалить питомца");
  }
}
