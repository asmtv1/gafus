export const PET_DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const PET_DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const PET_DOCUMENTS_MAX_PER_PET = 20;

export type PetDocumentAllowedMimeType = (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number];

export interface PetDocumentDto {
  id: string;
  petId: string;
  ownerId: string;
  name: string;
  mimeType: PetDocumentAllowedMimeType;
  sizeBytes: number;
  url: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Расширения, допустимые для документов питомца — убираем из подписи в UI */
const PET_DOCUMENT_VISIBLE_NAME_EXTENSION = /\.(pdf|jpe?g|png)$/i;

/**
 * Имя файла для отображения пользователю (без .pdf / .jpg и т.п.).
 * Полное имя с расширением хранится в БД и используется при скачивании.
 */
export function getPetDocumentDisplayName(storedFileName: string): string {
  return storedFileName.replace(PET_DOCUMENT_VISIBLE_NAME_EXTENSION, "");
}
