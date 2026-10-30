import { type PetVetVisit, type PetVetVisitInput } from "@gafus/types";
import { apiClient, apiClientMultipart, type ApiResponse } from "./client";

async function unwrap<T>(response: Promise<ApiResponse<T>>) {
  const result = await response;
  if (!result.success)
    throw new Error(result.error ?? "Не удалось выполнить действие. Повторите попытку");
  return result.data as T;
}
export type VetLocalFile = { uri: string; name: string; type: string; size: number };
const base = (petId: string) => `/api/v1/pets/${encodeURIComponent(petId)}/vet-visits`;
export const petVetVisitsApi = {
  // G1 V43: native owner/epoch guards on metadata-only GET, preserve old list/write API.
  listResponse: (petId: string, requestGuard: () => boolean) =>
    apiClient<PetVetVisit[]>(base(petId), { requestGuard }),
  detailResponse: (petId: string, visitId: string, requestGuard: () => boolean) =>
    apiClient<PetVetVisit>(`${base(petId)}/${encodeURIComponent(visitId)}`, { requestGuard }),
  // AG3 V44 metadata-only POST: existing Core path and optional session fence.
  // No automatic retry, headers claiming idempotency, or invented receipt.
  createResponse: (
    petId: string,
    data: Pick<PetVetVisitInput, "visitedOn" | "specialty"> & Partial<PetVetVisitInput>,
    requestGuard: () => boolean,
  ) => apiClient<PetVetVisit>(base(petId), { method: "POST", body: data, requestGuard }),
  // V45: Core PUT expects ALL fields, not PATCH semantics.
  editResponse: (
    petId: string,
    visitId: string,
    data: PetVetVisitInput,
    requestGuard: () => boolean,
  ) =>
    apiClient<PetVetVisit>(`${base(petId)}/${encodeURIComponent(visitId)}`, {
      method: "PUT",
      body: data,
      requestGuard,
    }),
  // V46: exactly one explicit Core DELETE, no implicit retry or fabricated receipt.
  deleteResponse: (petId: string, visitId: string, requestGuard: () => boolean) =>
    apiClient<void>(`${base(petId)}/${encodeURIComponent(visitId)}`, {
      method: "DELETE",
      requestGuard,
    }),
  list: (petId: string) => unwrap(apiClient<PetVetVisit[]>(base(petId))),
  save: (petId: string, data: PetVetVisitInput, id?: string) =>
    unwrap(
      apiClient<PetVetVisit>(`${base(petId)}${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body: data,
      }),
    ),
  remove: (petId: string, id: string) =>
    unwrap(apiClient<void>(`${base(petId)}/${id}`, { method: "DELETE" })),
  upload: (petId: string, id: string, file: VetLocalFile) =>
    unwrap(
      apiClientMultipart<{ id: string }>(`${base(petId)}/${id}/attachments`, () => {
        const form = new FormData();
        form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
        return form;
      }),
    ),
  removeAttachment: (petId: string, visitId: string, id: string) =>
    unwrap(apiClient<void>(`${base(petId)}/${visitId}/attachments/${id}`, { method: "DELETE" })),
  media: (
    petId: string,
    visitId: string,
    id: string,
    variant: "preview" | "original" | "download",
    requestGuard?: () => boolean,
  ) =>
    unwrap(
      apiClient<{ url: string }>(
        `${base(petId)}/${encodeURIComponent(visitId)}/attachments/${encodeURIComponent(id)}/media?variant=${variant}`,
        { ...(requestGuard ? { requestGuard } : {}) },
      ),
    ),
};
