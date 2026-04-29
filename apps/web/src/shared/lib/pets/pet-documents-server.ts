"use server";

import { createWebLogger } from "@gafus/logger";
import type { PetDocumentDto } from "@gafus/types";

const logger = createWebLogger("web-pet-documents-server");

type PetDocumentsDomainErrorCode =
  | "PET_NOT_FOUND"
  | "INVALID_DOCUMENT_TYPE"
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_LIMIT_REACHED";

function createDomainError(code: PetDocumentsDomainErrorCode, message: string): Error {
  const error = new Error(message);
  (error as Error & { code: PetDocumentsDomainErrorCode }).code = code;
  return error;
}

function normalizePetDocumentError(error: unknown): never {
  if (!(error instanceof Error)) {
    throw error;
  }

  if (error.message === "Питомец не найден") {
    throw createDomainError("PET_NOT_FOUND", "Питомец не найден");
  }
  if (error.message === "Недопустимый тип документа") {
    throw createDomainError(
      "INVALID_DOCUMENT_TYPE",
      "Недопустимый тип документа. Разрешены PDF, JPEG и PNG",
    );
  }
  if (error.message === "Размер документа превышает 10 МБ") {
    throw createDomainError(
      "DOCUMENT_TOO_LARGE",
      "Размер документа превышает 10 МБ",
    );
  }
  if (error.message === "Достигнут лимит документов питомца") {
    throw createDomainError(
      "DOCUMENT_LIMIT_REACHED",
      "Достигнут лимит документов питомца",
    );
  }

  throw error;
}

export async function listPetDocumentsForUser(
  petId: string,
  userId: string,
): Promise<PetDocumentDto[]> {
  try {
    const corePetsModule = await import("@gafus/core/services/pets");
    const listPetDocumentsFromCore = corePetsModule.listPetDocuments;
    if (typeof listPetDocumentsFromCore !== "function") {
      logger.error(
        "Экспорт listPetDocuments отсутствует в @gafus/core/services/pets",
        new Error("CORE_EXPORT_MISSING"),
      );
      throw new Error("Не удалось загрузить документы питомца");
    }
    return await listPetDocumentsFromCore(petId, userId);
  } catch (error) {
    normalizePetDocumentError(error);
  }
}

export async function uploadPetDocumentForUser(
  petId: string,
  userId: string,
  file: File,
): Promise<PetDocumentDto> {
  try {
    const corePetsModule = await import("@gafus/core/services/pets");
    const uploadPetDocumentFromCore = corePetsModule.uploadPetDocument;
    if (typeof uploadPetDocumentFromCore !== "function") {
      logger.error(
        "Экспорт uploadPetDocument отсутствует в @gafus/core/services/pets",
        new Error("CORE_EXPORT_MISSING"),
      );
      throw new Error("Не удалось сохранить документ питомца");
    }
    return await uploadPetDocumentFromCore(petId, userId, file);
  } catch (error) {
    normalizePetDocumentError(error);
  }
}

export async function deletePetDocumentForUser(
  documentId: string,
  userId: string,
  petId?: string,
): Promise<boolean> {
  try {
    const corePetsModule = await import("@gafus/core/services/pets");
    const deletePetDocumentFromCore = corePetsModule.deletePetDocument;
    if (typeof deletePetDocumentFromCore !== "function") {
      logger.error(
        "Экспорт deletePetDocument отсутствует в @gafus/core/services/pets",
        new Error("CORE_EXPORT_MISSING"),
      );
      throw new Error("Не удалось удалить документ питомца");
    }
    return await deletePetDocumentFromCore(documentId, userId, petId);
  } catch (error) {
    logger.error("Ошибка при удалении документа питомца", error as Error, {
      documentId,
      userId,
      petId,
    });
    throw error;
  }
}

export async function renamePetDocumentForUser(
  documentId: string,
  userId: string,
  name: string,
  petId?: string,
): Promise<PetDocumentDto | null> {
  try {
    const corePetsModule = await import("@gafus/core/services/pets");
    const renamePetDocumentFromCore = corePetsModule.renamePetDocument;
    if (typeof renamePetDocumentFromCore !== "function") {
      logger.error(
        "Экспорт renamePetDocument отсутствует в @gafus/core/services/pets",
        new Error("CORE_EXPORT_MISSING"),
      );
      throw new Error("Не удалось обновить название документа питомца");
    }
    return await renamePetDocumentFromCore(documentId, userId, name, petId);
  } catch (error) {
    logger.error("Ошибка при обновлении названия документа питомца", error as Error, {
      documentId,
      userId,
      petId,
    });
    throw error;
  }
}
