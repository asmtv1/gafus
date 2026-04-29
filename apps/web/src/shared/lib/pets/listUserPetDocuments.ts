"use server";

import { createWebLogger } from "@gafus/logger";
import type { PetDocumentDto } from "@gafus/types";

const logger = createWebLogger("web-list-user-pet-documents");

export async function listUserPetDocuments(userId: string): Promise<PetDocumentDto[]> {
  const corePetsModule = await import("@gafus/core/services/pets");
  const listUserPetDocumentsFromCore = corePetsModule.listUserPetDocuments;

  if (typeof listUserPetDocumentsFromCore !== "function") {
    logger.error(
      "Экспорт listUserPetDocuments отсутствует в @gafus/core/services/pets",
      new Error("CORE_EXPORT_MISSING"),
    );
    throw new Error("Не удалось получить документы питомцев");
  }

  return listUserPetDocumentsFromCore(userId);
}
