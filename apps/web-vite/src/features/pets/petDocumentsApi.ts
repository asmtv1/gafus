import { apiRequest, ApiError, isolatedNonprodBrowserS3Url } from "../../shared/api/client";
import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
} from "@gafus/types";

export type PetDocumentSummary = {
  id: string;
  petId: string;
  name: string;
  mimeType: (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number];
  sizeBytes: number;
  createdAt: string;
};

const validId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id) && id !== "." && id !== "..";
const pathFor = (petId: string, documentId?: string): string => {
  if (!validId(petId) || (documentId !== undefined && !validId(documentId)))
    throw new Error("Некорректный идентификатор документа питомца");
  return "/api/v1/pets/" + petId + "/documents" + (documentId ? "/" + documentId : "");
};

/** The server returns storage URLs and owner identifiers. Never place these
 * in a long-lived Query cache or render them from a list response. */
export function readDocument(raw: unknown, petId: string, ownerId: string): PetDocumentSummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_PET_DOCUMENT");
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !validId(value.id) ||
      value.petId !== petId || value.ownerId !== ownerId ||
      typeof value.name !== "string" || !value.name.trim() || value.name.length > 250 ||
      !PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(value.mimeType as PetDocumentSummary["mimeType"]) ||
      typeof value.sizeBytes !== "number" || !Number.isSafeInteger(value.sizeBytes) ||
      value.sizeBytes < 0 || value.sizeBytes > PET_DOCUMENT_MAX_SIZE_BYTES ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error("INVALID_PET_DOCUMENT");
  }
  return { id: value.id, petId, name: value.name, mimeType: value.mimeType as PetDocumentSummary["mimeType"],
    sizeBytes: value.sizeBytes, createdAt: value.createdAt };
}

export async function listPetDocuments(
  petId: string, ownerId: string,
): Promise<PetDocumentSummary[]> {
  const raw = await apiRequest<unknown>(pathFor(petId), { method: "GET", browserAuth: true });
  if (!Array.isArray(raw) || raw.length > 20) throw new Error("INVALID_PET_DOCUMENT_LIST");
  const result = raw.map(item => readDocument(item, petId, ownerId));
  if (new Set(result.map(item => item.id)).size !== result.length)
    throw new Error("DUPLICATE_PET_DOCUMENT");
  return result.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function mutation<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: FormData | object,
  expectedStatus?: number): Promise<T> {
  const response = await fetch(path, {
    method, cache: "no-store", credentials: "same-origin",
    headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie",
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  let envelope: { success?: boolean; data?: T; error?: string; code?: string };
  try { envelope = await response.json() as typeof envelope; }
  catch { throw new ApiError(response.status, "Некорректный ответ API", "INVALID_RESPONSE"); }
  if (!response.ok || envelope?.success !== true)
    throw new ApiError(response.status, envelope?.error ?? "Не удалось изменить документ", envelope?.code);
  if (expectedStatus !== undefined && response.status !== expectedStatus)
    throw new ApiError(response.status, "Изменение не подтверждено сервером", "STATUS_MISMATCH");
  return envelope.data as T;
}

export async function uploadPetDocument(
  petId: string, ownerId: string, file: File,
): Promise<PetDocumentSummary> {
  if (!PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as PetDocumentSummary["mimeType"]))
    throw new Error("Выберите PDF, JPG или PNG");
  if (file.size === 0 || file.size > PET_DOCUMENT_MAX_SIZE_BYTES)
    throw new Error("Размер документа должен быть от 1 байта до 10 МБ");
  const body = new FormData(); body.append("file", file);
  const raw = await mutation<unknown>(pathFor(petId), "POST", body, 201);
  return readDocument(raw, petId, ownerId);
}

export async function renamePetDocument(petId: string, documentId: string, ownerId: string,
  name: string): Promise<PetDocumentSummary> {
  const clean = name.trim();
  if (!clean || clean.length > 250) throw new Error("Укажите название документа до 250 символов");
  const raw = await mutation<unknown>(pathFor(petId, documentId), "PUT", { name: clean }, 200);
  const dto = readDocument(raw, petId, ownerId);
  if (dto.id !== documentId) throw new Error("INVALID_PET_DOCUMENT_ACK");
  return dto;
}

export async function deletePetDocument(petId: string, documentId: string): Promise<void> {
  await mutation(pathFor(petId, documentId), "DELETE", undefined, 200);
}

/** Request only when user explicitly opens/downloads. URL is short-lived,
 * must never be stored in Query cache, an analytics payload, or localStorage. */
export async function documentDownloadUrl(petId: string, documentId: string): Promise<string> {
  const result = await apiRequest<unknown>(pathFor(petId, documentId) + "/download",
    { method: "GET", browserAuth: true });
  if (!result || typeof result !== "object") throw new Error("INVALID_DOCUMENT_DOWNLOAD");
  const dto = result as Record<string, unknown>;
  if (dto.documentId !== documentId || typeof dto.downloadUrl !== "string" || dto.downloadUrl.length > 4096)
    throw new Error("INVALID_DOCUMENT_DOWNLOAD");
  const url = new URL(dto.downloadUrl);
  if (!(url.protocol === "https:" && !!url.hostname ||
        isolatedNonprodBrowserS3Url(dto.downloadUrl,"documents","signed-get")) ||
      url.username || url.password || url.hash)
    throw new Error("INVALID_DOCUMENT_DOWNLOAD_URL");
  return url.href;
}
