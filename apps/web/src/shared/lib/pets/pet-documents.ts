"use client";

import type { ApiResponse, PetDocumentDto } from "@gafus/types";

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<ApiResponse<T>>;
  }
  const rawText = await response.text();
  return {
    success: false,
    error: response.ok
      ? "Сервер вернул неожиданный формат ответа"
      : `Ошибка сервера (${response.status})`,
    code: "INVALID_RESPONSE_FORMAT",
    details: {
      status: response.status,
      preview: rawText.slice(0, 120),
    },
  } as ApiResponse<T>;
}

export async function getPetDocuments(petId: string): Promise<ApiResponse<PetDocumentDto[]>> {
  const response = await fetch(`/api/v1/pets/${petId}/documents`, { method: "GET" });
  return parseApiResponse<PetDocumentDto[]>(response);
}

export async function getAllPetDocuments(): Promise<ApiResponse<PetDocumentDto[]>> {
  const response = await fetch("/api/v1/pets/documents", { method: "GET" });
  return parseApiResponse<PetDocumentDto[]>(response);
}

export async function uploadPetDocument(
  petId: string,
  file: File,
  csrfToken: string,
): Promise<ApiResponse<PetDocumentDto>> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/v1/pets/${petId}/documents`, {
    method: "POST",
    headers: {
      "x-csrf-token": csrfToken,
    },
    credentials: "same-origin",
    body: formData,
  });
  return parseApiResponse<PetDocumentDto>(response);
}

export async function deletePetDocumentById(
  petId: string,
  documentId: string,
  csrfToken: string,
): Promise<ApiResponse<void>> {
  const response = await fetch(`/api/v1/pets/${petId}/documents/${documentId}`, {
    method: "DELETE",
    headers: {
      "x-csrf-token": csrfToken,
    },
    credentials: "same-origin",
  });
  return parseApiResponse<void>(response);
}

export async function renamePetDocumentById(
  petId: string,
  documentId: string,
  name: string,
  csrfToken: string,
): Promise<ApiResponse<PetDocumentDto>> {
  const response = await fetch(`/api/v1/pets/${petId}/documents/${documentId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    credentials: "same-origin",
    body: JSON.stringify({ name }),
  });
  return parseApiResponse<PetDocumentDto>(response);
}
