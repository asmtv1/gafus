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
  ) =>
    unwrap(
      apiClient<{ url: string }>(
        `${base(petId)}/${visitId}/attachments/${id}/media?variant=${variant}`,
      ),
    ),
};
