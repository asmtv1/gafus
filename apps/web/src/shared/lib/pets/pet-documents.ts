"use client";

import type { ApiResponse, PetDocumentDto } from "@gafus/types";

export async function getPetDocuments(petId: string): Promise<ApiResponse<PetDocumentDto[]>> {
  const response = await fetch(`/api/v1/pets/${petId}/documents`, { method: "GET" });
  return response.json();
}

export async function getAllPetDocuments(): Promise<ApiResponse<PetDocumentDto[]>> {
  const response = await fetch("/api/v1/pets/documents", { method: "GET" });
  return response.json();
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
  return response.json();
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
  return response.json();
}
